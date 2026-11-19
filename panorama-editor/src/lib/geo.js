// 球面 / 相机 / 投影数学内核
// 坐标约定:
//   lon(经度 yaw):   0 = +Z(北), 向东为正, 范围 [-180,180]
//   lat(纬度 pitch): 0 = 地平线, +90 = 天顶, -90 = 天底
//   直角坐标: x = cos(lat) sin(lon), y = sin(lat), z = cos(lat) cos(lon)
// 所有角度对外用「度」, 内部三角函数用弧度。

export const D2R = Math.PI / 180
export const R2D = 180 / Math.PI

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const lerp = (a, b, t) => a + (b - a) * t

/** 经度归一化到 [-180, 180) */
export function wrapLon(lon) {
  let l = ((lon + 180) % 360 + 360) % 360 - 180
  if (l === -180) l = 180
  return l
}

export function polarToVec(lon, lat) {
  const lo = lon * D2R, la = lat * D2R
  const cl = Math.cos(la)
  return [cl * Math.sin(lo), Math.sin(la), cl * Math.cos(lo)]
}

export function vecToPolar(v) {
  const [x, y, z] = v
  const r = Math.hypot(x, y, z) || 1
  const lat = Math.asin(clamp(y / r, -1, 1)) * R2D
  let lon = Math.atan2(x, z) * R2D
  if (lon === -180) lon = 180
  return [lon, lat]
}

export function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }
export function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
}
export function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0]/l, v[1]/l, v[2]/l]
}
export function scale(v, s) { return [v[0]*s, v[1]*s, v[2]*s] }
export function add(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]] }

/**
 * 大圆最短路径插值 (slerp), 支持额外整圈旋转。
 * 返回 t∈[0,1] 时的方向向量; extraSpins>0 时路径绕球多转 n 圈后到达。
 */
export function slerpSpin(a, b, t, extraSpins = 0) {
  const A = norm(a), B = norm(b)
  let cosW = clamp(dot(A, B), -1, 1)
  // 几乎同向时直接线性归一化, 避免除零
  if (cosW > 0.999999) return norm(lerpVec(A, B, t))
  if (cosW < -0.999999) {
    // 对跖点: 选一个正交轴走半大圆
    const axis = orthoAxis(A)
    const theta = Math.PI * t + extraSpins * 2 * Math.PI * t
    return norm(add(scale(A, Math.cos(theta)), scale(axis, Math.sin(theta))))
  }
  const omega = Math.acos(cosW)
  const theta = omega * t + extraSpins * 2 * Math.PI * t
  const sinO = Math.sin(omega)
  const k0 = Math.cos(theta) - (Math.sin(theta) * cosW / sinO)
  const k1 = Math.sin(theta) / sinO
  return norm(add(scale(A, k0), scale(B, k1)))
}

function lerpVec(a, b, t) { return add(scale(a, 1 - t), scale(b, t)) }

function orthoAxis(v) {
  const ref = Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  return norm(cross(v, ref))
}

/** 相机正交基: f 前方, r 右方, u 上方 */
export function cameraBasis(yaw, pitch) {
  const f = polarToVec(yaw, pitch)
  const worldUp = [0, 1, 0]
  let r = norm(cross(worldUp, f))
  // 近天顶/天底时 cross 退化, 用经度方向兜底
  if (Math.hypot(r[0], r[1], r[2]) < 1e-6) r = polarToVec(yaw + 90, 0)
  const u = cross(f, r)
  return { f, r, u }
}

/**
 * 矩形透视投影: 球面方向 -> 屏幕归一化坐标 (x,y ∈ [-1,1] 对应视野边界)。
 * 返回 null 表示在相机身后不可见。
 */
export function projectDirection(dir, yaw, pitch, fov) {
  const { f, r, u } = cameraBasis(yaw, pitch)
  const zc = dot(dir, f)
  if (zc <= 0.0005) return null
  const xc = dot(dir, r)
  const yc = dot(dir, u)
  const half = Math.tan(fov * 0.5 * D2R)
  return { x: xc / (zc * half), y: yc / (zc * half), depth: zc }
}

/**
 * 精确反投影: 屏幕归一化坐标 -> 球面方向 (再转经纬)。
 * 拖动热点时走这条精确反算, 不做平面近似, 两极附近也不会跑偏。
 */
export function unprojectToPolar(nx, ny, yaw, pitch, fov) {
  const { f, r, u } = cameraBasis(yaw, pitch)
  const half = Math.tan(fov * 0.5 * D2R)
  const dir = norm(add(add(f, scale(r, nx * half)), scale(u, ny * half)))
  return vecToPolar(dir)
}

/** 两个经纬点之间的大圆夹角(度) */
export function angularDistance(lon1, lat1, lon2, lat2) {
  return Math.acos(clamp(dot(polarToVec(lon1, lat1), polarToVec(lon2, lat2)), -1, 1)) * R2D
}

/* ---------------- 立方体面 ↔ 球面方向 ----------------
 * 采用 three.js 约定, 面标签:
 *   px (+X 东)  nx (-X 西)  py (+Y 上)  ny (-Y 下)  pz (+Z 北)  nz (-Z 南)
 * 面内 uv: (u,v) ∈ [0,1]², u 向右, v 向下(屏幕坐标)。
 */
export const CUBE_FACES = [
  { id: 'px', label: '+X 东', dir: [1, 0, 0],  up: [0, 1, 0] },
  { id: 'nx', label: '-X 西', dir: [-1, 0, 0], up: [0, 1, 0] },
  { id: 'py', label: '+Y 上', dir: [0, 1, 0],  up: [0, 0, -1] },
  { id: 'ny', label: '-Y 下', dir: [0, -1, 0], up: [0, 0, -1] },
  { id: 'pz', label: '+Z 北', dir: [0, 0, 1],  up: [0, 1, 0] },
  { id: 'nz', label: '-Z 南', dir: [0, 0, -1], up: [0, 1, 0] }
]

/** 给定面与面内 uv, 返回该像素对应的球面方向 */
export function faceUVToDir(faceId, u, v) {
  const face = CUBE_FACES.find(f => f.id === faceId)
  const d = face.dir
  // 右向量 = up × dir
  const right = cross(face.up, d)
  const su = u * 2 - 1   // 左 -1 → 右 +1
  const sv = 1 - v * 2   // 上 +1 → 下 -1
  return norm(add(add(d, scale(right, su)), scale(face.up, sv)))
}

/** 球面方向 -> { face, u, v } (与 faceUVToDir 互逆, 标准立方体贴图布局) */
export function dirToFaceUV(dir) {
  const v = norm(dir)
  const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2])
  let faceId, sc, su, sv
  if (ax >= ay && ax >= az) {
    if (v[0] > 0) { faceId = 'px'; sc =  v[0]; su = -v[2]; sv =  v[1] }
    else          { faceId = 'nx'; sc = -v[0]; su =  v[2]; sv =  v[1] }
  } else if (ay >= az) {
    if (v[1] > 0) { faceId = 'py'; sc =  v[1]; su =  v[0]; sv = -v[2] }
    else          { faceId = 'ny'; sc = -v[1]; su = -v[0]; sv = -v[2] }
  } else {
    if (v[2] > 0) { faceId = 'pz'; sc =  v[2]; su =  v[0]; sv =  v[1] }
    else          { faceId = 'nz'; sc = -v[2]; su = -v[0]; sv =  v[1] }
  }
  const m = 1 / sc
  return { face: faceId, u: (su * m + 1) / 2, v: (1 - sv * m) / 2 }
}
