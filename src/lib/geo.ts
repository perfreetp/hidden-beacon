/**
 * 球面几何与全景投影工具集
 *
 * 约定：
 *  - 世界坐标：Y 轴向上，Z 轴指向经度 0°，X 轴指向东经 90°。
 *  - 经度 lon ∈ [-180, 180)，纬度 lat ∈ [-90, 90]。
 *  - 相机以 (yaw=中心经度, pitch=中心纬度, fov=垂直视场角°) 描述，无滚转。
 *  - 屏幕投影采用球心投影（gnomonic / rectilinear），这也是常见全景播放器的做法：
 *    大圆在画面上呈现为直线，视口边界是球面大圆弧围成的四边形。
 */

export type Vec3 = { x: number; y: number; z: number };
export type LonLat = { lon: number; lat: number };
export type Camera = { yaw: number; pitch: number; fov: number };

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const FOV_MIN = 30;
export const FOV_MAX = 110;
export const PITCH_LIMIT = 89.5;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampFov(fov: number): number {
  return clamp(Number.isFinite(fov) ? fov : 70, FOV_MIN, FOV_MAX);
}

/** 归一化经度到 [-180, 180) */
export function wrapLon(lon: number): number {
  if (!Number.isFinite(lon)) return 0;
  let v = ((lon + 180) % 360 + 360) % 360 - 180;
  // 处理 -180 的浮点误差
  if (v >= 180) v -= 360;
  return v === -180 ? -180 : v;
}

export function clampLat(lat: number, limit = PITCH_LIMIT): number {
  return clamp(Number.isFinite(lat) ? lat : 0, -limit, limit);
}

/** 从 from 到 to 的最短经度差，结果在 (-180, 180] */
export function lonDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l < 1e-12) return { x: 0, y: 0, z: 1 };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return normalize({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });
}

export function lonLatToVec(lon: number, lat: number): Vec3 {
  const lo = wrapLon(lon) * DEG2RAD;
  const la = clampLat(lat, 90) * DEG2RAD;
  const cl = Math.cos(la);
  return { x: cl * Math.sin(lo), y: Math.sin(la), z: cl * Math.cos(lo) };
}

export function vecToLonLat(a: Vec3): LonLat {
  const n = normalize(a);
  return {
    lon: Math.atan2(n.x, n.z) * RAD2DEG,
    lat: Math.asin(clamp(n.y, -1, 1)) * RAD2DEG,
  };
}

export interface CameraBasis {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

export function cameraBasis(cam: Camera): CameraBasis {
  const y = cam.yaw * DEG2RAD;
  const p = clampLat(cam.pitch) * DEG2RAD;
  const forward = { x: Math.cos(p) * Math.sin(y), y: Math.sin(p), z: Math.cos(p) * Math.cos(y) };
  const right = { x: Math.cos(y), y: 0, z: -Math.sin(y) };
  const up = cross(forward, right);
  return { forward, right, up };
}

/** 由正交基反推 (yaw, pitch)，丢弃滚转 */
export function cameraFromBasis(forward: Vec3, fov: number): Camera {
  const f = normalize(forward);
  return {
    yaw: wrapLon(Math.atan2(f.x, f.z) * RAD2DEG),
    pitch: clampLat(Math.asin(clamp(f.y, -1, 1)) * RAD2DEG),
    fov: clampFov(fov),
  };
}

export function cameraFromLonLat(lon: number, lat: number, fov: number): Camera {
  return { yaw: wrapLon(lon), pitch: clampLat(lat), fov: clampFov(fov) };
}

export function tanHalfFov(cam: Camera, aspect = 1): { tx: number; ty: number } {
  const ty = Math.tan(clampFov(cam.fov) * DEG2RAD * 0.5);
  return { tx: ty * Math.max(aspect, 1e-6), ty };
}

export interface Projected {
  x: number;
  y: number;
  /** 相机前方深度；>0 表示在视锥前方 */
  z: number;
  visible: boolean;
  ndcX: number;
  ndcY: number;
}

export function projectLonLat(
  lon: number,
  lat: number,
  cam: Camera,
  width: number,
  height: number,
): Projected {
  return projectDir(lonLatToVec(lon, lat), cam, width, height);
}

/** 把世界方向投影到屏幕（球心投影） */
export function projectDir(dir: Vec3, cam: Camera, width: number, height: number): Projected {
  const { forward, right, up } = cameraBasis(cam);
  const z = dot(dir, forward);
  if (z <= 1e-6) {
    return { x: NaN, y: NaN, z, visible: false, ndcX: NaN, ndcY: NaN };
  }
  const xc = dot(dir, right) / z;
  const yc = dot(dir, up) / z;
  const aspect = height > 0 ? width / height : 1;
  const { tx, ty } = tanHalfFov(cam, aspect);
  const ndcX = xc / tx;
  const ndcY = yc / ty;
  return {
    x: (ndcX + 1) * 0.5 * width,
    y: (1 - ndcY) * 0.5 * height,
    z,
    visible: true,
    ndcX,
    ndcY,
  };
}

/** 屏幕点 → 世界方向（视口内任意点都有 z>0） */
export function screenRay(x: number, y: number, width: number, height: number, cam: Camera): Vec3 {
  const { forward, right, up } = cameraBasis(cam);
  const aspect = height > 0 ? width / height : 1;
  const { tx, ty } = tanHalfFov(cam, aspect);
  const ndcX = (x / width) * 2 - 1;
  const ndcY = ((height - y) / height) * 2 - 1;
  const d = add(add(scale(right, ndcX * tx), scale(up, ndcY * ty)), forward);
  return normalize(d);
}

export function screenToLonLat(x: number, y: number, width: number, height: number, cam: Camera): LonLat {
  return vecToLonLat(screenRay(x, y, width, height, cam));
}

/** 罗德里格斯公式：把向量绕单位轴旋转 */
export function rotateAroundAxis(vec: Vec3, axis: Vec3, angleRad: number): Vec3 {
  const k = normalize(axis);
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const kv = cross(k, vec);
  const kd = dot(k, vec);
  return {
    x: vec.x * c + kv.x * s + k.x * kd * (1 - c),
    y: vec.y * c + kv.y * s + k.y * kd * (1 - c),
    z: vec.z * c + kv.z * s + k.z * kd * (1 - c),
  };
}

/** 返回把 from 旋到 to 的最小旋转（轴角形式） */
export interface AxisAngle {
  axis: Vec3;
  angle: number;
}

export function rotationFromTo(from: Vec3, to: Vec3): AxisAngle {
  const a = normalize(from);
  const b = normalize(to);
  const d = clamp(dot(a, b), -1, 1);
  const angle = Math.acos(d);
  const c = cross(a, b);
  const axis = length(c) < 1e-9 ? { x: 0, y: 1, z: 0 } : normalize(c);
  return { axis, angle };
}

export function applyAxisAngle(vec: Vec3, r: AxisAngle): Vec3 {
  if (r.angle < 1e-9) return vec;
  return rotateAroundAxis(vec, r.axis, r.angle);
}

/**
 * 按世界轴旋转相机（保持地平线水平，丢弃滚转）。
 * 用于拖动视角 / 拖拽热点。
 */
export function rotateCamera(cam: Camera, r: AxisAngle): Camera {
  if (r.angle < 1e-9) return cam;
  const { forward } = cameraBasis(cam);
  const next = rotateAroundAxis(forward, r.axis, r.angle);
  return cameraFromBasis(next, cam.fov);
}

/** 球面视口四角（大圆弧边界）采样为经纬度闭合环 */
export function viewPolygon(cam: Camera, width: number, height: number, samplesPerEdge = 10): LonLat[] {
  const corners = [
    screenRay(0, 0, width, height, cam),
    screenRay(width, 0, width, height, cam),
    screenRay(width, height, width, height, cam),
    screenRay(0, height, width, height, cam),
  ];
  const out: LonLat[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let s = 0; s < samplesPerEdge; s++) {
      out.push(vecToLonLat(lerpVec(a, b, s / samplesPerEdge)));
    }
  }
  return out;
}

/** 经纬度之间的球面角距离（度） */
export function angularDistance(a: LonLat, b: LonLat): number {
  const va = lonLatToVec(a.lon, a.lat);
  const vb = lonLatToVec(b.lon, b.lat);
  return Math.acos(clamp(dot(va, vb), -1, 1)) * RAD2DEG;
}

/** 相机最短路径插值：经度走短弧，纬度、视角线性 */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  if (t <= 0) return { ...a };
  if (t >= 1) return { ...b };
  return {
    yaw: wrapLon(a.yaw + lonDelta(a.yaw, b.yaw) * t),
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    fov: a.fov + (b.fov - a.fov) * t,
  };
}

/** 在球面某点处，朝 compass 方向（0=北/增纬方向，90=东/增经方向）的切向单位向量 */
export function tangentAt(lon: number, lat: number, headingDeg: number): Vec3 {
  const lo = lon * DEG2RAD;
  const la = lat * DEG2RAD;
  const north = { x: -Math.sin(la) * Math.sin(lo), y: Math.cos(la), z: -Math.sin(la) * Math.cos(lo) };
  const east = { x: Math.cos(lo), y: 0, z: -Math.sin(lo) };
  const h = headingDeg * DEG2RAD;
  return normalize(add(scale(north, Math.cos(h)), scale(east, Math.sin(h))));
}

/**
 * 屏幕上切向 t 指向的角度（度），约定 0 = 屏幕上方，90 = 屏幕右方，顺时针为正。
 * 该角度可直接用于 SVG 中 `rotate(...)` 绘制的箭头（箭头默认朝上）。
 */
export function screenHeadingOfTangent(
  lon: number,
  lat: number,
  headingDeg: number,
  cam: Camera,
  width: number,
  height: number,
): number {
  const base = lonLatToVec(lon, lat);
  const t = tangentAt(lon, lat, headingDeg);
  const eps = 0.004; // 约 0.23°
  const p0 = projectDir(base, cam, width, height);
  const p1 = projectDir(normalize(add(base, scale(t, eps))), cam, width, height);
  if (!p0.visible || !p1.visible) return 0;
  return Math.atan2(p1.x - p0.x, p0.y - p1.y) * RAD2DEG;
}

/** 等距柱状图上的像素坐标（用于取样） */
export function lonLatToEquirectUV(lon: number, lat: number): { u: number; v: number } {
  return { u: wrapLon(lon) / 360 + 0.5, v: (90 - clampLat(lat, 90)) / 180 };
}

export function formatLonLat(ll: LonLat, digits = 1): string {
  const seg = (n: number, pos: string, neg: string) =>
    `${n >= 0 ? pos : neg} ${Math.abs(n).toFixed(digits)}°`;
  return `${seg(ll.lon, '东经', '西经')} · ${seg(ll.lat, '北纬', '南纬')}`;
}

/** 判断纬度是否落在极区，用于 UI 提示 */
export function isPolar(lat: number, threshold = 75): boolean {
  return Math.abs(lat) >= threshold;
}

/** 2:1 等距柱状图宽高比容差检查 */
export function equirectAspectInfo(width: number, height: number): {
  ratio: number;
  ok: boolean;
  note: string;
} {
  const ratio = height > 0 ? width / height : 0;
  const ok = Math.abs(ratio - 2) <= 0.04;
  return {
    ratio,
    ok,
    note: ok ? '2:1 标准等距柱状图' : `宽高比 ${ratio.toFixed(3)}:1，非标准 2:1（可能拉伸）`,
  };
}
