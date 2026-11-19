/**
 * SVG 叠层几何：球面大圆弧采样、折线路径、罗盘朝向。
 */
import { Camera, lonLatToVec, normalize, add, scale, dot, screenHeadingOfTangent, projectDir, vecToLonLat } from './geo';

export interface LayerPoint {
  lon: number;
  lat: number;
  x: number;
  y: number;
  visible: boolean;
}

type Project = (lon: number, lat: number) => LayerPoint;

function slerp(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, omega: number, t: number) {
  if (omega < 1e-6) return a;
  const s = Math.sin(omega);
  const w1 = Math.sin((1 - t) * omega) / s;
  const w2 = Math.sin(t * omega) / s;
  return { x: a.x * w1 + b.x * w2, y: a.y * w1 + b.y * w2, z: a.z * w1 + b.z * w2 };
}

/**
 * 球面大圆弧 a→b 的屏幕折线。返回若干段（跨过视口边缘时会被断开）。
 * 球心投影下大圆在屏幕上本来是直线，所以相邻采样点可直接连线。
 */
export function greatCircleSegments(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
  project: Project,
  samples = 32,
): LayerPoint[][] {
  const va = lonLatToVec(a.lon, a.lat);
  const vb = lonLatToVec(b.lon, b.lat);
  const omega = Math.acos(Math.max(-1, Math.min(1, dot(va, vb))));
  const segments: LayerPoint[][] = [];
  let cur: LayerPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const v = slerp(va, vb, omega, i / samples);
    const ll = vecToLonLat(v);
    const p = project(ll.lon, ll.lat);
    if (!p.visible) {
      if (cur.length > 1) segments.push(cur);
      cur = [];
      continue;
    }
    cur.push(p);
  }
  if (cur.length > 1) segments.push(cur);
  return segments;
}

export function polylinePath(points: { x: number; y: number }[]): string {
  if (!points.length) return '';
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) d += ` L${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  return d;
}

export function segmentsPath(segments: LayerPoint[][]): string {
  return segments.map(polylinePath).filter(Boolean).join(' ');
}

/** 罗盘方位名（0=北，顺时针） */
export function compassName(deg: number): string {
  const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return names[i];
}

/** 箭头在屏幕上的旋转角（0 = 朝上） */
export function arrowScreenAngle(lon: number, lat: number, heading: number, cam: Camera, w: number, h: number): number {
  return screenHeadingOfTangent(lon, lat, heading, cam, w, h);
}

/** 由两点屏幕坐标求罗盘朝向（用于拖动箭头方向柄后回写 heading） */
export function screenVectorToHeading(
  lon: number,
  lat: number,
  dxScreen: number,
  dyScreen: number,
  cam: Camera,
  w: number,
  h: number,
): number {
  // 用屏幕方向构造切向，再反解 heading
  const base = lonLatToVec(lon, lat);
  const { forward, right, up } = {
    forward: lonLatToVec(cam.yaw, cam.pitch),
    right: { x: Math.cos((cam.yaw * Math.PI) / 180), y: 0, z: -Math.sin((cam.yaw * Math.PI) / 180) },
    up: { x: 0, y: 0, z: 0 },
  };
  // 屏面 up = forward × right
  const ux = forward.y * right.z - forward.z * right.y;
  const uy = forward.z * right.x - forward.x * right.z;
  const uz = forward.x * right.y - forward.y * right.x;
  const tang = normalize(add(scale(right, dxScreen), scale({ x: ux, y: uy, z: uz }, -dyScreen)));
  // 去掉法向分量
  const n = base;
  const proj = {
    x: tang.x - n.x * dot(tang, n),
    y: tang.y - n.y * dot(tang, n),
    z: tang.z - n.z * dot(tang, n),
  };
  const lo = (lon * Math.PI) / 180;
  const la = (lat * Math.PI) / 180;
  const north = { x: -Math.sin(la) * Math.sin(lo), y: Math.cos(la), z: -Math.sin(la) * Math.cos(lo) };
  const east = { x: Math.cos(lo), y: 0, z: -Math.sin(lo) };
  const hx = dot(proj, east);
  const hy = dot(proj, north);
  return ((Math.atan2(hx, hy) * 180) / Math.PI + 360) % 360;
}

export { projectDir };
