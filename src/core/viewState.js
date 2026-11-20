import { reactive } from 'vue'

// 瓦片级别范围(与 scripts/gen-tiles.mjs 生成的级别一致)
export const MINZ = 6
export const MAXZ = 11
// z0 时整个世界 = 256px,瓦片坐标为标准 XYZ
export const WORLD = 256
// 瓦片内几何坐标范围
export const EXTENT = 4096

// 视图状态:中心点(z0 世界像素)、缩放(小数)、旋转(度)、倾斜(度)
export const view = reactive({
  cx: 128,
  cy: 128,
  zoom: 9.6,
  rotation: 0,
  pitch: 0,
})

// 视口尺寸,由 MapView 的 ResizeObserver 维护
export const size = reactive({ w: 800, h: 600 })

const rad = (d) => (d * Math.PI) / 180

// 当前整数瓦片级别
export function tileZoom() {
  return Math.max(MINZ, Math.min(MAXZ, Math.round(view.zoom)))
}

// 世界 -> 屏幕 的 SVG 变换串。extraY 用于倾斜时的分层偏移(屏幕空间)。
export function viewTransform(extraY = 0) {
  const k = 2 ** view.zoom
  const cp = Math.cos(rad(view.pitch))
  return (
    `translate(${size.w / 2} ${size.h / 2 + extraY}) ` +
    `rotate(${view.rotation}) scale(1 ${cp}) scale(${k}) translate(${-view.cx} ${-view.cy})`
  )
}

export function screenToWorld(sx, sy) {
  const k = 2 ** view.zoom
  const cp = Math.cos(rad(view.pitch))
  const r = rad(view.rotation)
  const dx = sx - size.w / 2
  const dy = sy - size.h / 2
  const rx = dx * Math.cos(r) + dy * Math.sin(r)
  const ry = (-dx * Math.sin(r) + dy * Math.cos(r)) / cp
  return { x: rx / k + view.cx, y: ry / k + view.cy }
}

export function worldToScreen(wx, wy) {
  const k = 2 ** view.zoom
  const cp = Math.cos(rad(view.pitch))
  const r = rad(view.rotation)
  const dx = (wx - view.cx) * k
  const dy = (wy - view.cy) * k * cp
  return {
    x: dx * Math.cos(r) - dy * Math.sin(r) + size.w / 2,
    y: dx * Math.sin(r) + dy * Math.cos(r) + size.h / 2,
  }
}

// 缩放到指定级别,保持屏幕上 (sx, sy) 处的世界点不动
export function zoomTo(newZoom, sx = size.w / 2, sy = size.h / 2) {
  newZoom = Math.max(MINZ - 0.5, Math.min(MAXZ + 1, newZoom))
  const w0 = screenToWorld(sx, sy)
  view.zoom = newZoom
  const k = 2 ** view.zoom
  const cp = Math.cos(rad(view.pitch))
  const r = rad(view.rotation)
  const dx = sx - size.w / 2
  const dy = sy - size.h / 2
  const rx = dx * Math.cos(r) + dy * Math.sin(r)
  const ry = (-dx * Math.sin(r) + dy * Math.cos(r)) / cp
  view.cx = w0.x - rx / k
  view.cy = w0.y - ry / k
}

export function resetView() {
  Object.assign(view, { cx: 128, cy: 128, zoom: 9.6, rotation: 0, pitch: 0 })
}
