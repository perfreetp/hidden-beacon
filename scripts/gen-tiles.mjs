// 生成演示用矢量瓦片:合成一片山地区域(步道 / 公路 / 水系 / 山体阴影),
// 按 XYZ 层级裁剪写入 public/tiles/{z}/{x}/{y}.json。
// 瓦片内坐标范围 0..4096,单位世界坐标为 [0,1] 正方形。
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const OUT = fileURLToPath(new URL('../public/tiles', import.meta.url))
const ZMIN = 6
const ZMAX = 11
const EXTENT = 4096

// ---------- 几何工具 ----------
// Catmull-Rom 样条采样,让线条自然弯曲
function catmull(pts, n = 20) {
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let j = 0; j < n; j++) {
      const t = j / n
      const t2 = t * t
      const t3 = t2 * t
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

function polyLen(pts) {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}

// Liang-Barsky 线段裁剪
function clipSeg(a, b, r) {
  const [x0, y0, x1, y1] = r
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const p = [-dx, dx, -dy, dy]
  const q = [a[0] - x0, x1 - a[0], a[1] - y0, y1 - a[1]]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0) {
        if (t > t1) return null
        if (t > t0) t0 = t
      } else {
        if (t < t0) return null
        if (t < t1) t1 = t
      }
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ]
}

// 折线裁剪到矩形,返回若干段
function clipLine(pts, r) {
  const out = []
  let cur = []
  const eq = (a, b) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = clipSeg(pts[i], pts[i + 1], r)
    if (!seg) {
      if (cur.length > 1) out.push(cur)
      cur = []
      continue
    }
    const [a, b] = seg
    if (cur.length && eq(cur[cur.length - 1], a)) cur.push(b)
    else {
      if (cur.length > 1) out.push(cur)
      cur = [a, b]
    }
  }
  if (cur.length > 1) out.push(cur)
  return out
}

// Sutherland-Hodgman 多边形裁剪
function clipHalf(pts, axis, val, keepGreater) {
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const ain = keepGreater ? a[axis] >= val : a[axis] <= val
    const bin = keepGreater ? b[axis] >= val : b[axis] <= val
    if (ain) out.push(a)
    if (ain !== bin) {
      const t = (val - a[axis]) / (b[axis] - a[axis])
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
    }
  }
  return out
}
function clipPoly(ring, r) {
  let pts = ring
  pts = clipHalf(pts, 0, r[0], true)
  if (pts.length < 3) return null
  pts = clipHalf(pts, 0, r[2], false)
  if (pts.length < 3) return null
  pts = clipHalf(pts, 1, r[1], true)
  if (pts.length < 3) return null
  pts = clipHalf(pts, 1, r[3], false)
  return pts.length >= 3 ? pts : null
}

// ---------- 合成地形要素(单位坐标,中心 0.5,0.5) ----------
const P = (dx, dy) => [0.5 + dx / 1000, 0.5 + dy / 1000]
const KM = (pts) => Math.round(polyLen(pts) * 3000 * 10) / 10 // 区域约 24km 宽

const ridges = [
  catmull([P(-4, -1.5), P(-2, -2.2), P(0, -1.8), P(2, -2.4), P(4, -1.6)]),
  catmull([P(-3.5, 1.8), P(-1, 1.2), P(1, 1.6), P(3.2, 1.0)]),
  catmull([P(-1.5, -4), P(-1.0, -2.5), P(-0.6, -0.9)]),
]

// 山体阴影:沿山脊线向"背光侧"生成一系列四边形色带
function shadeQuads(line, seed) {
  const quads = []
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, y0] = line[i]
    const [x1, y1] = line[i + 1]
    let nx = y1 - y0
    let ny = -(x1 - x0)
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    if (ny < 0) {
      nx = -nx
      ny = -ny
    }
    const shade = Math.round((0.2 + 0.3 * (0.5 + 0.5 * Math.sin(i * 0.7 + seed))) * 100) / 100
    const w = 0.0003 + shade * 0.0009
    quads.push({
      shade,
      ring: [
        [x0, y0],
        [x1, y1],
        [x1 + nx * w, y1 + ny * w],
        [x0 + nx * w, y0 + ny * w],
      ],
    })
  }
  return quads
}

const hillshade = ridges.flatMap((r, i) =>
  shadeQuads(r, i * 2.1).map((q, j) => ({ id: `hs-${i}-${j}`, props: { shade: q.shade }, ring: q.ring }))
)

const waters = [
  { id: 'water-bailong', name: '白龙溪', pts: catmull([P(-3.5, -1.2), P(-2, -0.6), P(-0.5, 0.2), P(1, 1.0), P(2.5, 2.2), P(3.8, 3.5)]) },
  { id: 'water-lengshan', name: '冷杉溪', pts: catmull([P(1.5, -3.5), P(1.2, -2), P(0.6, -0.5), P(0.2, 1.0)]) },
  { id: 'water-west', name: '', pts: catmull([P(-4, 0.5), P(-2.5, 0.8), P(-1, 1.5), P(0.2, 2.8)]) },
]

const roads = [
  { id: 'road-yunling', name: '云岭公路', pts: catmull([P(-4.5, 3.5), P(-2, 2.6), P(0.5, 2.9), P(2.5, 3.8), P(4.5, 4.2)]) },
  { id: 'road-linchang', name: '林场路', pts: catmull([P(3.8, -4), P(3.2, -2), P(2.6, 0), P(2.2, 2), P(2.5, 3.8)]) },
]

const trails = [
  { id: 'trail-yunji', name: '云脊步道', pts: catmull([P(-4, -1.4), P(-2, -2.1), P(0, -1.7), P(2, -2.3), P(4, -1.5)]) },
  { id: 'trail-xigu', name: '溪谷小径', pts: catmull([P(-3.4, -1.1), P(-1.9, -0.5), P(-0.4, 0.3), P(1.1, 1.1), P(2.6, 2.3)]) },
  { id: 'trail-songlin', name: '松林环线', pts: catmull([P(-2.5, 0.5), P(-1.5, -0.3), P(-0.3, 0.1), P(-0.8, 1.3), P(-2.0, 1.4), P(-2.5, 0.5)], 12) },
  { id: 'trail-yakou', name: '垭口穿越线', pts: catmull([P(0.2, -3.8), P(0.4, -2.4), P(0.1, -1.0), P(-0.2, 0.5), P(-0.6, 2.2)]) },
  { id: 'trail-guanjing', name: '观景台支线', pts: catmull([P(2, -2.3), P(2.6, -3.0), P(3.2, -3.6)]) },
  { id: 'trail-gudao', name: '古道上山线', pts: catmull([P(-4.2, 3.3), P(-3.0, 2.0), P(-2.2, 0.9), P(-1.6, -0.2)]) },
]

const lineLayers = [
  ['water', waters],
  ['roads', roads],
  ['trails', trails],
]

// ---------- 总体范围 ----------
const allPts = [
  ...ridges.flat(),
  ...waters.flatMap((f) => f.pts),
  ...roads.flatMap((f) => f.pts),
  ...trails.flatMap((f) => f.pts),
]
const bbox = allPts.reduce(
  (b, p) => [
    Math.min(b[0], p[0]),
    Math.min(b[1], p[1]),
    Math.max(b[2], p[0]),
    Math.max(b[3], p[1]),
  ],
  [Infinity, Infinity, -Infinity, -Infinity]
)
const BUF = 0.0015
bbox[0] -= BUF
bbox[1] -= BUF
bbox[2] += BUF
bbox[3] += BUF

// ---------- 逐层逐瓦片裁剪输出 ----------
let written = 0
for (let z = ZMIN; z <= ZMAX; z++) {
  const n = 2 ** z
  const ts = 1 / n
  const tx0 = Math.max(0, Math.floor(bbox[0] / ts))
  const tx1 = Math.min(n - 1, Math.floor(bbox[2] / ts))
  const ty0 = Math.max(0, Math.floor(bbox[1] / ts))
  const ty1 = Math.min(n - 1, Math.floor(bbox[3] / ts))

  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      // 最高级别故意缺一部分瓦片,演示父级瓦片占位
      if (z === ZMAX && (tx * 31 + ty * 17) % 9 === 0) continue

      const rect = [tx * ts, ty * ts, (tx + 1) * ts, (ty + 1) * ts]
      const toLocal = (p) => [
        Math.round(((p[0] - tx * ts) / ts) * EXTENT),
        Math.round(((p[1] - ty * ts) / ts) * EXTENT),
      ]
      const layers = {}

      // 山体阴影(多边形)
      const hs = []
      for (const f of hillshade) {
        const clipped = clipPoly(f.ring, rect)
        if (clipped) hs.push({ id: f.id, props: f.props, rings: [clipped.map(toLocal)] })
      }
      if (hs.length) layers.hillshade = hs

      // 线要素
      for (const [lk, feats] of lineLayers) {
        const out = []
        for (const f of feats) {
          const runs = clipLine(f.pts, rect)
          for (const run of runs) {
            out.push({
              id: f.id,
              props: { name: f.name || undefined, length: KM(f.pts) },
              geom: run.map(toLocal),
            })
          }
        }
        if (out.length) layers[lk] = out
      }

      if (!Object.keys(layers).length) continue
      const dir = join(OUT, String(z), String(tx))
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${ty}.json`), JSON.stringify({ z, x: tx, y: ty, layers }))
      written++
    }
  }
}

console.log(`已生成 ${written} 个瓦片 -> ${OUT}`)
console.log(`级别 z${ZMIN}..z${ZMAX},区域 bbox: ${bbox.map((v) => v.toFixed(4)).join(', ')}`)
