import { reactive, computed, shallowRef } from 'vue'
import {
  polarToVec, vecToPolar, slerpSpin, wrapLon, clamp,
  projectDirection, unprojectToPolar, norm, cross, dot, scale, add, D2R, R2D
} from '../lib/geo.js'
import { renderEquirect, computeSeamGains, imageToImageData } from '../lib/cube.js'
import { buildDemoPoint } from '../lib/demo.js'

let idSeq = 1
export const uid = (p) => `${p}_${Date.now().toString(36)}_${idSeq++}`

/** Rodrigues: 绕任意轴旋转向量 */
function rotateVec(v, axis, angRad) {
  const c = Math.cos(angRad), s = Math.sin(angRad)
  const k = axis
  return norm(add(add(scale(v, c), scale(cross(k, v), s)),
                   scale(k, dot(k, v) * (1 - c))))
}

export const state = reactive({
  points: {},          // id -> point
  pointOrder: [],
  currentPointId: null,
  view: { yaw: 0, pitch: 0, fov: 75 },
  transition: {
    duration: 1200,    // ms
    extraSpins: 0,     // 额外整圈数
    active: false,
    progress: 0
  },
  settings: {
    mapWidth: 1536,    // 等距柱状渲染宽
    mapHeight: 768,
    seamAlign: true
  },
  tool: 'pan',         // pan | hotspot | annotation | comment
  selected: { kind: null, id: null }
})

export const currentPoint = computed(() => state.points[state.currentPointId] || null)
export const links = computed(() => {
  const out = []
  for (const p of state.pointOrder) {
    for (const h of state.points[p].hotspots) {
      if (h.targetPointId) out.push({ id: h.id, from: p, to: h.targetPointId, hotspot: h.id })
    }
  }
  return out
})

/* ---------------- 点位 / 图片 ---------------- */

export function addPoint(name) {
  const id = uid('point')
  state.points[id] = {
    id, name: name || `点位 ${state.pointOrder.length + 1}`,
    faces: {},                 // faceId -> dataURL
    equirect: null,            // dataURL
    equirectImage: null,       // HTMLImageElement (非响应式用 shallowRef 挂外面)
    gains: null,
    hotspots: [], annotations: [], comments: []
  }
  state.pointOrder.push(id)
  if (!state.currentPointId) state.currentPointId = id
  return id
}

export function removePoint(id) {
  delete state.points[id]
  state.pointOrder = state.pointOrder.filter(p => p !== id)
  for (const p of state.pointOrder) {
    state.points[p].hotspots.forEach(h => { if (h.targetPointId === id) h.targetPointId = null })
  }
  if (state.currentPointId === id) state.currentPointId = state.pointOrder[0] || null
}

export function switchPoint(id) {
  if (!state.points[id]) return
  state.currentPointId = id
  state.selected = { kind: null, id: null }
}

const imageCache = new Map() // pointId -> HTMLImageElement
export function getEquirectImage(pointId) { return imageCache.get(pointId) || null }

async function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

/** 为一个点位上传某面照片 (File) */
export async function setFaceFile(pointId, faceId, file) {
  const buf = await file.arrayBuffer()
  const blob = new Blob([buf])
  const url = URL.createObjectURL(blob)
  const img = await loadImage(url)
  const dataUrl = await fileToDataURL(file)
  state.points[pointId].faces[faceId] = dataUrl
  URL.revokeObjectURL(url)
  await rebuildEquirect(pointId, img.width || img.naturalWidth)
}

function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
}

/** 六面齐了之后重建等距柱状图 (含接缝对齐) */
export async function rebuildEquirect(pointId, hintSize = 0) {
  const p = state.points[pointId]
  const need = ['px', 'nx', 'py', 'ny', 'pz', 'nz']
  if (!need.every(f => p.faces[f])) return false
  const imgs = {}
  for (const f of need) imgs[f] = await loadImage(p.faces[f])
  const imgData = {}
  for (const f of need) imgData[f] = imageToImageData(imgs[f])
  let gains = null
  if (state.settings.seamAlign) {
    gains = computeSeamGains(imgData)
    p.gains = gains
  }
  const size = hintSize || imgs.px.naturalWidth || 512
  const width = state.settings.mapWidth
  const height = state.settings.mapHeight
  const canvas = renderEquirect(imgData, { width, height, gains })
  p.equirect = canvas.toDataURL('image/jpeg', 0.92)
  const eqImg = await loadImage(p.equirect)
  imageCache.set(pointId, eqImg)
  return true
}

/* ---------------- 热点 / 标注 / 留言 ---------------- */

export function addHotspot(pointId, lon, lat) {
  const h = { id: uid('hs'), lon, lat, label: '热点', targetPointId: null, color: '#ffb020' }
  state.points[pointId].hotspots.push(h)
  state.selected = { kind: 'hotspot', id: h.id }
  return h
}

export function addAnnotation(pointId, lon, lat) {
  const a = {
    id: uid('an'), lon, lat, heading: state.view.yaw,
    title: '设备标注', note: ''
  }
  state.points[pointId].annotations.push(a)
  state.selected = { kind: 'annotation', id: a.id }
  return a
}

export function addComment(pointId, lon, lat, text, author = '同事') {
  const c = { id: uid('cm'), lon, lat, text, author, time: new Date().toISOString() }
  state.points[pointId].comments.push(c)
  return c
}

export function removeSelected() {
  const p = currentPoint.value
  if (!p || !state.selected.kind) return
  const key = state.selected.kind === 'hotspot' ? 'hotspots'
    : state.selected.kind === 'annotation' ? 'annotations' : 'comments'
  p[key] = p[key].filter(x => x.id !== state.selected.id)
  state.selected = { kind: null, id: null }
}

/* ---------------- 视角 ---------------- */

export function setView(yaw, pitch, fov) {
  state.view.yaw = wrapLon(yaw)
  state.view.pitch = clamp(pitch, -89.9, 89.9)
  if (fov != null) state.view.fov = clamp(fov, 20, 110)
}

/** 视角轨道拖动: dx/dy 为像素, 按相机基向量做真三维旋转, 两极不跑偏 */
export function orbitDrag(dx, dy) {
  const speed = (state.view.fov * 0.9) / 600
  let dir = polarToVec(state.view.yaw, state.view.pitch)
  if (dx !== 0) {
    dir = rotateVec(dir, [0, 1, 0], -dx * speed * D2R)          // 绕世界竖直轴
  }
  if (dy !== 0) {
    const f = polarToVec(state.view.yaw, state.view.pitch)
    const right = norm(cross([0, 1, 0], f))
    dir = rotateVec(dir, right, -dy * speed * D2R)              // 绕相机右轴
  }
  const [lon, lat] = vecToPolar(dir)
  setView(lon, clamp(lat, -89.9, 89.9))
}

/** 屏幕归一化坐标 -> 精确经纬 (热点拖动/拾取) */
export function pickPolar(nx, ny) {
  return unprojectToPolar(nx, ny, state.view.yaw, state.view.pitch, state.view.fov)
}

export function projectPoint(lon, lat) {
  return projectDirection(polarToVec(lon, lat), state.view.yaw, state.view.pitch, state.view.fov)
}

let rafToken = 0
/** 沿大圆最短路径飞行; extraSpins 控制额外旋转圈数 */
export function flyTo(lon, lat, opts = {}) {
  const duration = opts.duration ?? state.transition.duration
  const extraSpins = opts.extraSpins ?? state.transition.extraSpins
  const onSwap = opts.onSwap || null
  const startVec = polarToVec(state.view.yaw, state.view.pitch)
  const endVec = polarToVec(lon, lat)
  const token = ++rafToken
  state.transition.active = true
  state.transition.progress = 0
  const t0 = performance.now()
  let swapped = false
  return new Promise((resolve) => {
    function frame(now) {
      if (token !== rafToken) { state.transition.active = false; resolve(false); return }
      const t = clamp((now - t0) / duration, 0, 1)
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 // easeInOutQuad
      const v = slerpSpin(startVec, endVec, e, extraSpins)
      const [lo, la] = vecToPolar(v)
      setView(lo, la)
      state.transition.progress = t
      if (!swapped && t >= 0.5) { swapped = true; onSwap && onSwap() }
      if (t < 1) requestAnimationFrame(frame)
      else {
        state.transition.active = false
        setView(lon, lat)
        resolve(true)
      }
    }
    requestAnimationFrame(frame)
  })
}

export function cancelFlight() { rafToken++; state.transition.active = false }

/** 点热点跳转: 转向热点方向, 中途换点位贴图 */
export async function activateHotspot(h) {
  if (!h.targetPointId) {
    await flyTo(h.lon, h.lat)
    return
  }
  const target = h.targetPointId
  await flyTo(h.lon, h.lat, {
    onSwap: () => switchPoint(target)
  })
  setView(h.lon, clamp(h.lat, -89.9, 89.9))
}

export function nudgeView(dyaw, dpitch) {
  setView(state.view.yaw + dyaw, state.view.pitch + dpitch)
}

/* ---------------- 漫游包导入 / 导出 ---------------- */

export function exportPackage() {
  const points = state.pointOrder.map(id => {
    const p = state.points[id]
    return {
      id: p.id, name: p.name, faces: p.faces, equirect: p.equirect,
      gains: p.gains,
      hotspots: p.hotspots, annotations: p.annotations, comments: p.comments
    }
  })
  return {
    format: 'pump-station-pano-tour',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...state.settings, transition: { ...state.transition } },
    points,
    links: links.value
  }
}

export function downloadPackage(filename = 'pano-tour.json') {
  const blob = new Blob([JSON.stringify(exportPackage())], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function importPackage(json) {
  const pkg = typeof json === 'string' ? JSON.parse(json) : json
  if (pkg.format !== 'pump-station-pano-tour') throw new Error('漫游包格式不匹配')
  resetAll()
  if (pkg.settings) {
    Object.assign(state.settings, pkg.settings)
    if (pkg.settings.transition) Object.assign(state.transition, pkg.settings.transition)
  }
  for (const p of pkg.points) {
    state.points[p.id] = {
      faces: {}, equirect: null, equirectImage: null, gains: p.gains || null,
      hotspots: p.hotspots || [], annotations: p.annotations || [], comments: p.comments || [],
      ...p
    }
    state.pointOrder.push(p.id)
    if (p.equirect) loadImage(p.equirect).then(img => imageCache.set(p.id, img)).catch(() => {})
  }
  state.currentPointId = state.pointOrder[0] || null
}

export function resetAll() {
  rafToken++
  for (const k of Object.keys(state.points)) delete state.points[k]
  state.pointOrder = []
  state.currentPointId = null
  state.selected = { kind: null, id: null }
  imageCache.clear()
}

/* ---------------- 演示数据 ---------------- */

export async function loadDemo() {
  resetAll()
  const p1 = buildDemoPoint(1)
  addPoint(p1.name)
  const id1 = state.currentPointId
  Object.assign(state.points[id1], p1)
  await rebuildEquirect(id1)
  const p2 = buildDemoPoint(2)
  const id2 = addPoint(p2.name)
  Object.assign(state.points[id2], p2)
  await rebuildEquirect(id2)
  // 连接两个点位的热点
  const h1 = state.points[id1].hotspots.find(h => h._demoLink)
  if (h1) { h1.targetPointId = id2; delete h1._demoLink }
  const h2 = state.points[id2].hotspots.find(h => h._demoLink)
  if (h2) { h2.targetPointId = id1; delete h2._demoLink }
  state.currentPointId = id1
  setView(0, 0, 75)
}

export { imageCache }
export { wrapLon } from '../lib/geo.js'
