import { terrainGradient } from './heightfield';

/** 虚拟经纬度原点(米制世界坐标 (0,0) 对应的经纬度) */
export const ORIGIN_LAT = 29.595;
export const ORIGIN_LON = 101.88;

const M_PER_DEG_LAT = 111320;

/** 世界坐标(米) → 经纬度。+x = 东,+z = 北 */
export function toLatLon(x: number, z: number): { lat: number; lon: number } {
  const lat = ORIGIN_LAT + z / M_PER_DEG_LAT;
  const lon = ORIGIN_LON + x / (M_PER_DEG_LAT * Math.cos((ORIGIN_LAT * Math.PI) / 180));
  return { lat, lon };
}

const WINDS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

/** 坡度(°)与坡向(方位角 0-360,0=北,顺时针;平坦处返回 null) */
export function slopeAspect(x: number, z: number): { slopeDeg: number; aspectDeg: number | null } {
  const g = terrainGradient(x, z);
  const slopeDeg = (Math.atan(Math.hypot(g.dx, g.dz)) * 180) / Math.PI;
  if (Math.hypot(g.dx, g.dz) < 1e-4) return { slopeDeg, aspectDeg: null };
  // 坡向 = 下坡方向的罗盘方位
  const aspectDeg = (Math.atan2(-g.dx, -g.dz) * 180) / Math.PI;
  return { slopeDeg, aspectDeg: (aspectDeg + 360) % 360 };
}

export function aspectLabel(deg: number | null): string {
  if (deg === null) return '平地';
  return WINDS[Math.round(deg / 45) % 8];
}
