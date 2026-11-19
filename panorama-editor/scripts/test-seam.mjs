// 合成数据验证接缝增益反解: 已知真实增益, 检查 LS 求解能否还原 (容差 5%)。
import { CUBE_FACES, norm, dot, cross, clamp } from '../src/lib/geo.js'

const SIZE = 32
function makeFace(r, g, b) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4)
  for (let i = 0; i < SIZE * SIZE; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255
  }
  return { width: SIZE, height: SIZE, data }
}
const base = { r: 180, g: 160, b: 140 }
const trueGains = { px: 1, nx: 1.1, py: 0.9, ny: 1.05, pz: 0.95, nz: 1.15 }
const images = {}
for (const f of CUBE_FACES) {
  const g = trueGains[f.id]
  images[f.id] = makeFace(clamp(base.r * g, 0, 255), clamp(base.g * g, 0, 255), clamp(base.b * g, 0, 255))
}

function faceBasis(face) { return { d: face.dir, r: norm(cross(face.up, face.dir)), u: face.up } }
function dirToUVOnFace(faceId, dir) {
  const face = CUBE_FACES.find(f => f.id === faceId)
  const { d, r, u } = faceBasis(face)
  const v = norm(dir)
  const k = dot(v, d)
  return [ (clamp(dot(v, r) / k, -1, 1) + 1) / 2, (1 - clamp(dot(v, u) / k, -1, 1)) / 2 ]
}
function sample(img, u, v) {
  const x = clamp(u, 0, 1) * (img.width - 1), y = clamp(v, 0, 1) * (img.height - 1)
  const i = (Math.round(y) * img.width + Math.round(x)) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}
function* enumEdges() {
  for (const fixedA of [0, 1, 2]) for (const fixedB of [0, 1, 2]) {
    if (fixedA >= fixedB) continue
    const vary = [0, 1, 2].find(a => a !== fixedA && a !== fixedB)
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) yield { fixedA, sa, fixedB, sb, vary }
  }
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

const pairs = []
for (const e of enumEdges()) {
  for (let i = 0; i < 8; i++) {
    const t = -0.8 + 1.6 * i / 7
    const vec = [0, 0, 0]; vec[e.fixedA] = e.sa; vec[e.fixedB] = e.sb; vec[e.vary] = t
    const order = [0, 1, 2].sort((a, b) => Math.abs(vec[b]) - Math.abs(vec[a]))
    const faceByAxisSign = { '0+': 'px', '0-': 'nx', '1+': 'py', '1-': 'ny', '2+': 'pz', '2-': 'nz' }
    const fa = faceByAxisSign[order[0] + (vec[order[0]] >= 0 ? '+' : '-')]
    const fb = faceByAxisSign[order[1] + (vec[order[1]] >= 0 ? '+' : '-')]
    pairs.push([fa, sample(images[fa], ...dirToUVOnFace(fa, vec)),
                fb, sample(images[fb], ...dirToUVOnFace(fb, vec))])
  }
}
const freeFaces = CUBE_FACES.filter(f => f.id !== 'px')
const colMap = Object.fromEntries(freeFaces.map((f, i) => [f.id, i]))
const m = freeFaces.length
const solved = { px: 1 }
for (let ch = 0; ch < 3; ch++) {
  const A = Array.from({ length: m }, () => new Float64Array(m))
  const b = new Float64Array(m)
  for (const [fa, ca, fb, cb] of pairs) {
    const va = ca[ch], vb = cb[ch]
    const rows = []
    if (fa !== 'px') rows.push([colMap[fa], va])
    if (fb !== 'px') rows.push([colMap[fb], -vb])
    const rhs = (fa === 'px' ? -va : 0) + (fb === 'px' ? vb : 0)
    for (const [r1, c1] of rows) for (const [r2, c2] of rows) A[r1][r2] += c1 * c2
    for (const [r1, c1] of rows) b[r1] += c1 * rhs
  }
  const sol = gaussSolve(A, b)
  freeFaces.forEach((f, i) => { solved[f.id] = sol[i] })
  console.log('ch', 'rgb'[ch], '解:', sol.map(x => x.toFixed(3)).join(', '))
}
console.log('\n面     模拟曝光  校正增益(应≈倒数)  偏差')
let fail = 0
for (const f of CUBE_FACES) {
  const t = 1 / trueGains[f.id] // 校正乘子 = 曝光增益的倒数
  const s = solved[f.id]
  const ok = Math.abs(t - s) < 0.05
  if (!ok) fail++
  console.log(`${f.id.padEnd(3)}  ${trueGains[f.id].toFixed(2)}      ${s.toFixed(3)} (期望 ${t.toFixed(3)})  ${ok ? '✓' : '✗'}`)
}
process.exit(fail ? 1 : 0)
