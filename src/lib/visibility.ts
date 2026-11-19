/**
 * 热点在屏幕上的可见性与形变
 */
import { Camera, cameraBasis, dot, lonLatToVec, projectLonLat } from './geo';

export interface HotspotView {
  x: number;
  y: number;
  /** 屏幕空间横向压扁系数：球心投影越靠边缘横向拉伸越大 */
  squash: number;
  /** 与相机朝向的夹角（度） */
  angle: number;
  visible: boolean;
  /** 在相机背面 */
  behind: boolean;
}

export function hotspotView(lon: number, lat: number, cam: Camera, width: number, height: number): HotspotView {
  const p = projectLonLat(lon, lat, cam, width, height);
  const dir = lonLatToVec(lon, lat);
  const { forward } = cameraBasis(cam);
  const cosAngle = Math.max(-1, Math.min(1, dot(dir, forward)));
  const angle = (Math.acos(cosAngle) * 180) / Math.PI;
  if (!p.visible) {
    return { x: p.x, y: p.y, squash: 1, angle, visible: false, behind: true };
  }
  const r2 = p.ndcX * p.ndcX + p.ndcY * p.ndcY;
  // 球心投影在半径 r 处的径向拉伸为 1/(1+r²)；取径向与切向的折中
  const squash = Math.max(0.35, 1 / Math.sqrt(1 + r2 * 0.8));
  return { x: p.x, y: p.y, squash, angle, visible: true, behind: false };
}

/** 是否落在视口附近（含 margin 像素），用于跳过完全不可见的绘制 */
export function nearViewport(v: { x: number; y: number; visible: boolean }, width: number, height: number, margin = 32): boolean {
  if (!v.visible) return false;
  return v.x >= -margin && v.x <= width + margin && v.y >= -margin && v.y <= height + margin;
}
