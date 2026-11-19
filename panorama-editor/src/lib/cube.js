// 六张立方体面照片 -> 等距柱状展开图 (equirectangular) 渲染
// 含接缝颜色对齐: 采样 12 条公共棱边两侧颜色, 最小二乘求每面 RGB 增益。
import { CUBE_FACES, dirToFaceUV, faceUVToDir, norm, dot, cross, scale, add, clamp } from './geo.js'

function faceBasis(face) {
  const right = norm(cross(face.up, face.dir))
  return { d: face.dir, r: right, u: face.up }
}

/** 任意球面方向在指定面上的 uv (用于棱边采样) */
function dirToUVOnFace(faceId, dir) {
  const face = CUBE_FACES.find(f => f.id === faceId)
  const { d, r, u } = faceBasis(face)
  const v = norm(dir)
  const k = dot(v, d)
  const su = dot(v, r) / k
  const sv = dot(v, u) / k
  return { u: (clamp(su, -1, 1) + 1) / 2, v: (1 - clamp(sv, -1, 1)) / 2 }
}

/** 枚举立方体 12 条棱: 两个轴固定 ±1, 第三个轴取 t */
function* enumEdges() {
  const axes = [0, 1, 2]
  for (const fixedA of axes) {
    for (const fixedB of axes) {
      if (fixedA >= fixedB) continue
      const vary = axes.find(a => a !== fixedA && a !== fixedB)
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          yield { fixedA, sa, fixedB, sb, vary }
        }
      }
    }
  }
}

function sampleBilinear(img, u, v) {
  const w = img.width, h = img.height
  const px = clamp(u, 0, 1) * (w - 1)
  const py = clamp(v, 0, 1) * (h - 1)
  const x0 = Math.floor(px), y0 = Math.floor(py)
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1)
  const tx = px - x0, ty = py - y0
  const d = img.data
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4
  const i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4
  const out = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    const top = d[i00 + c] * (1 - tx) + d[i10 + c] * tx
    const bot = d[i01 + c] * (1 - tx) + d[i11 + c] * tx
    out[c] = top * (1 - ty) + bot * ty
  }
  return out
}

/** 读取一张图为 ImageData */
export function imageToImageData(img) {
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, c.width, c.height)
}

/**
 * 接缝颜色对齐。
 * images: { faceId: ImageData|ImageBitmap }
 * 返回 { faceId: {r,g,b} } 增益, px 面基准锁定为 1。
 */
export function computeSeamGains(images) {
  const data = {}
  for (const f of CUBE_FACES) {
    const im = images[f.id]
    data[f.id] = im.data ? im : imageToImageData(im)
  }
  // 每条棱收集两侧颜色对
  const pairs = []
  const N = 24
  for (const e of enumEdges()) {
    for (let i = 0; i < N; i++) {
      const t = -0.85 + (1.7 * i) / (N - 1)
      const vec = [0, 0, 0]
      vec[e.fixedA] = e.sa
      vec[e.fixedB] = e.sb
      vec[e.vary] = t
      // 该方向上分量最大的两个面 = 共棱的两个面 (按轴分量的符号选正/负面)
      const order = [0, 1, 2].sort((a, b) => Math.abs(vec[b]) - Math.abs(vec[a]))
      const faceByAxisSign = { '0+': 'px', '0-': 'nx', '1+': 'py', '1-': 'ny', '2+': 'pz', '2-': 'nz' }
      const faceA = faceByAxisSign[order[0] + (vec[order[0]] >= 0 ? '+' : '-')]
      const faceB = faceByAxisSign[order[1] + (vec[order[1]] >= 0 ? '+' : '-')]
      const uvA = dirToUVOnFace(faceA, vec)
      const uvB = dirToUVOnFace(faceB, vec)
      pairs.push([faceA, sampleBilinear(data[faceA], uvA.u, uvA.v),
                  faceB, sampleBilinear(data[faceB], uvB.u, uvB.v)])
    }
  }
  // 每通道独立最小二乘: ga*ca - gb*cb = 0, 锁定 px 面 g=1
  const freeFaces = CUBE_FACES.filter(f => f.id !== 'px')
  const col = {}
  freeFaces.forEach((f, i) => { col[f.id] = i })
  const m = freeFaces.length
  const gains = { px: { r: 1, g: 1, b: 1 } }
  for (let ch = 0; ch < 3; ch++) {
    const A = Array.from({ length: m }, () => new Float64Array(m))
    const b = new Float64Array(m)
    for (const [fa, ca, fb, cb] of pairs) {
      // 接缝相等约束 ga*ca - gb*cb = 0: 两侧同为正系数, px 锁定项移到右端
      const va = ca[ch], vb = cb[ch]
      const rows = []
      if (fa !== 'px') rows.push([col[fa], va])
      if (fb !== 'px') rows.push([col[fb], -vb])
      const rhs = (fa === 'px' ? -va : 0) + (fb === 'px' ? vb : 0)
      for (const [r1, c1] of rows) for (const [r2, c2] of rows) A[r1][r2] += c1 * c2
      for (const [r1, c1] of rows) b[r1] += c1 * rhs
    }
    const sol = gaussSolve(A, b)
    freeFaces.forEach((f, i) => {
      gains[f.id] = gains[f.id] || {}
      gains[f.id][['r', 'g', 'b'][ch]] = clamp(sol[i], 0.5, 2)
    })
  }
  return gains
}

function gaussSolve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    ;[M[col], M[piv]] = [M[piv], M[col]]
    const d = M[col][col] || 1e-9
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / d
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-9))
}

/**
 * 渲染等距柱状图。
 * images: {faceId: ImageData|ImageBitmap}, gains: computeSeamGains 结果
 */
export function renderEquirect(images, { width = 1536, height = 768, gains = null } = {}) {
  const src = {}
  for (const f of CUBE_FACES) {
    const im = images[f.id]
    src[f.id] = im.data ? im : imageToImageData(im)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  const out = ctx.createImageData(width, height)
  const od = out.data
  const cache = {}
  for (const f of CUBE_FACES) {
    const im = src[f.id]
    cache[f.id] = { d: im.data, w: im.width, h: im.height, g: gains ? gains[f.id] : { r: 1, g: 1, b: 1 } }
  }
  for (let y = 0; y < height; y++) {
    const lat = 90 - (y + 0.5) / height * 180
    for (let x = 0; x < width; x++) {
      const lon = (x + 0.5) / width * 360 - 180
      const { face, u, v } = dirToFaceUV(equirectDir(lon, lat))
      const c = cache[face]
      const px = clamp(u, 0, 1) * (c.w - 1)
      const py = clamp(v, 0, 1) * (c.h - 1)
      const x0 = Math.floor(px), y0 = Math.floor(py)
      const x1 = Math.min(x0 + 1, c.w - 1), y1 = Math.min(y0 + 1, c.h - 1)
      const tx = px - x0, ty = py - y0
      const i00 = (y0 * c.w + x0) * 4, i10 = (y0 * c.w + x1) * 4
      const i01 = (y1 * c.w + x0) * 4, i11 = (y1 * c.w + x1) * 4
      const o = (y * width + x) * 4
      for (let k = 0; k < 3; k++) {
        const top = c.d[i00 + k] * (1 - tx) + c.d[i10 + k] * tx
        const bot = c.d[i01 + k] * (1 - tx) + c.d[i11 + k] * tx
        od[o + k] = clamp((top * (1 - ty) + bot * ty) * c.g[['r', 'g', 'b'][k]], 0, 255)
      }
      od[o + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
  return canvas
}

// 等距柱状像素中心 -> 方向向量 (避免循环依赖, 内联实现)
function equirectDir(lon, lat) {
  const lo = lon * Math.PI / 180, la = lat * Math.PI / 180
  const cl = Math.cos(la)
  return norm([cl * Math.sin(lo), Math.sin(la), cl * Math.cos(lo)])
}

/** canvas -> PNG dataURL */
export function canvasToDataURL(canvas) { return canvas.toDataURL('image/png') }

export { faceUVToDir }
