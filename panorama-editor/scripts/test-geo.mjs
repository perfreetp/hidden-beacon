// 纯 Node 运行: node scripts/test-geo.mjs
// 验证: 投影往返精度(<1°)、立方体 face/dir 往返、slerp 最短路径、两极拖动。
import {
  polarToVec, vecToPolar, slerpSpin, unprojectToPolar, projectDirection,
  angularDistance, faceUVToDir, dirToFaceUV, wrapLon
} from '../src/lib/geo.js'

let pass = 0, fail = 0
const assert = (cond, msg) => {
  if (cond) { pass++ } else { fail++; console.error('  ✗ ' + msg) }
}
const approx = (a, b, eps) => Math.abs(a - b) <= eps

// 1) 经纬 -> 向量 -> 经纬 往返
console.log('1) polar 往返')
for (const [lon, lat] of [[0, 0], [123, 45], [-170, -80], [90, 89.5], [-90, -89.5], [180, 10]]) {
  const v = polarToVec(lon, lat)
  const [lo2, la2] = vecToPolar(v)
  assert(approx(wrapLon(lo2 - lon), 0, 1e-9) && approx(la2, lat, 1e-9),
    `polar roundtrip ${lon},${lat} -> ${lo2},${la2}`)
}

// 2) 投影 -> 反投影 往返, 各 fov / 视角含近极点
console.log('2) 屏幕拾取往返 (要求误差 < 1°, 实际目标 0.02°)')
let maxErr = 0
for (const yaw of [0, 47, -130, 180]) {
  for (const pitch of [0, 60, -70, 85]) {
    for (const fov of [30, 60, 90, 110]) {
      for (const nx of [-0.9, -0.3, 0.2, 0.85]) {
        for (const ny of [-0.8, 0, 0.7]) {
          const [lon, lat] = unprojectToPolar(nx, ny, yaw, pitch, fov)
          const pr = projectDirection(polarToVec(lon, lat), yaw, pitch, fov)
          const err = Math.max(Math.abs(pr.x - nx), Math.abs(pr.y - ny)) * fov * 0.5
          maxErr = Math.max(maxErr, err)
          assert(pr !== null && err < 1, `pick roundtrip err=${err.toFixed(4)}°`)
        }
      }
    }
  }
}
console.log(`   最大拾取误差 ${maxErr.toFixed(5)}°`)

// 3) 立方体 face/uv 往返与棱边连续性
console.log('3) 立方体面映射')
for (const face of ['px', 'nx', 'py', 'ny', 'pz', 'nz']) {
  for (const u of [0.01, 0.25, 0.5, 0.75, 0.99]) {
    for (const v of [0.01, 0.5, 0.99]) {
      const d = faceUVToDir(face, u, v)
      const back = dirToFaceUV(d)
      assert(back.face === face && approx(back.u, u, 1e-9) && approx(back.v, v, 1e-9),
        `cube roundtrip ${face} ${u},${v} -> ${back.face} ${back.u},${back.v}`)
    }
  }
}
// 棱边: pz 右棱(u=1, +X 侧)与 px 左棱(u=0, -Z 侧)是同一条棱
let seamMax = 0
for (let i = 0; i <= 10; i++) {
  const t = -0.9 + i * 0.18
  const d1 = faceUVToDir('pz', 1, (t + 1) / 2)
  const d2 = faceUVToDir('px', 0, (t + 1) / 2)
  const a = Math.acos(Math.max(-1, Math.min(1, d1.reduce((s, x, k) => s + x * d2[k], 0)))) * 180 / Math.PI
  seamMax = Math.max(seamMax, a)
}
assert(seamMax < 0.01, `相邻面公共棱方向偏差 ${seamMax.toFixed(4)}°`)

// 4) slerp 是大圆最短路径: 任意 t 处与起点角距 = t * 总角距
console.log('4) slerp 最短路径')
const A = polarToVec(30, 20), B = polarToVec(-60, -40)
const total = Math.acos(Math.max(-1, Math.min(1, A.reduce((s, x, k) => s + x * B[k], 0)))) * 180 / Math.PI
for (const t of [0, 0.25, 0.5, 0.75, 1]) {
  const P = slerpSpin(A, B, t, 0)
  const d = angularDistance(...vecToPolar(A), ...vecToPolar(P))
  assert(approx(d, total * t, 1e-6), `slerp t=${t} d=${d.toFixed(3)} expect ${(total * t).toFixed(3)}`)
}
// 加一圈: 终点不变; t=0.5 时带圈路径的实际转角 = 原半程 + 180°
const P1 = slerpSpin(A, B, 1, 1)
assert(approx(angularDistance(...vecToPolar(P1), ...vecToPolar(B)), 0, 1e-9), 'slerp 加圈后终点一致')
// 用相邻点累计路径长验证 (角距是最短距离, 无法直接表达绕圈)
let pathLen = 0
let prev = A
for (let i = 1; i <= 200; i++) {
  const cur = slerpSpin(A, B, i / 200, 1)
  pathLen += Math.acos(Math.max(-1, Math.min(1, prev.reduce((s, x, k) => s + x * cur[k], 0))))
  prev = cur
}
pathLen *= 180 / Math.PI
assert(approx(pathLen, total + 360, 0.5), `带圈路径总长 ${pathLen.toFixed(1)}° ≈ ${(total + 360).toFixed(1)}°`)

// 5) 近极点拖动不跑偏: 在 lat=89° 处做水平轨道拖动 30°, 纬度保持稳定
console.log('5) 近极点稳定性')
{
  const start = polarToVec(10, 89)
  const axis = [0, 1, 0]
  const ang = -30 * Math.PI / 180
  const c = Math.cos(ang), s = Math.sin(ang)
  const rot = start.map(() => 0)
  const cross = [axis[1] * start[2] - axis[2] * start[1], axis[2] * start[0] - axis[0] * start[2], axis[0] * start[1] - axis[1] * start[0]]
  const kdot = axis.reduce((sum, x, k) => sum + x * start[k], 0)
  for (let k = 0; k < 3; k++) rot[k] = start[k] * c + cross[k] * s + axis[k] * kdot * (1 - c)
  const [, lat2] = vecToPolar(rot)
  assert(approx(lat2, 89, 1e-9), `近极点水平拖动后纬度 ${lat2.toFixed(6)}`)
}

// 6) wrapLon
assert(wrapLon(185) === -175 && wrapLon(-185) === 175 && wrapLon(360) === 0, 'wrapLon')

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
