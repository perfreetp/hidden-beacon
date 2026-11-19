import { reactive, watch } from 'vue'
import { Spline } from './spline'
import { TARGET_DEFS } from './targets'

let uid = 0
const genId = () => 'pt' + (++uid) + '_' + Math.random().toString(36).slice(2, 7)

export const store = reactive({
  tab: 'path',               // path | target | speed | roam
  path: { closed: false, points: [] },   // points: {id, position:[x,y,z]}
  bindings: {},              // pointId -> { targetId, weight(1-5), mode:'follow'|'fixed', fixedPosition? }
  speed: {
    gear: 3,
    keyframes: [
      { pos: 0.25, mult: 1.0 },
      { pos: 0.5,  mult: 1.0 },
      { pos: 0.75, mult: 1.0 }
    ]
  },
  transition: 0.8,               // 相机衔接过渡时间（秒）0.3 ~ 1.5
  selectedPointId: null,
  playback: {
    playing: false,
    distance: 0,
    hud: { seg: 0, segCount: 0, remain: 0, remainPct: 0 }
  },
  preview: { active: false, joint: 1 },
  highlightTargetId: null,
  focusReq: { id: null, n: 0 },
  saveState: '',
  importError: ''
})

// 目标实体的实时位置（由 Viewport 每帧写入，普通对象避免触发响应式）
export const liveTargetPos = {}

export function targetDef(id) {
  return TARGET_DEFS.find(t => t.id === id)
}

export function getSpline() {
  const pts = store.path.points
  if (pts.length < 2) return null
  return new Spline(pts.map(p => p.position), store.path.closed)
}

// ---------------- 增删控制点 ----------------

export function addPoint(pos) {
  const p = { id: genId(), position: [+pos[0].toFixed(3), +pos[1].toFixed(3), +pos[2].toFixed(3)] }
  store.path.points.push(p)
  store.selectedPointId = p.id
  return p
}

export function removePoint(id) {
  const i = store.path.points.findIndex(p => p.id === id)
  if (i >= 0) store.path.points.splice(i, 1)
  delete store.bindings[id]
  if (store.selectedPointId === id) store.selectedPointId = null
}

export function clearPath() {
  store.path.points = []
  store.bindings = {}
  store.selectedPointId = null
  store.playback.distance = 0
  store.playback.playing = false
}

// ---------------- 序列化 / 导入导出 ----------------

export function serialize() {
  return {
    version: 1,
    path: {
      closed: store.path.closed,
      points: store.path.points.map(p => ({ id: p.id, position: [...p.position] }))
    },
    bindings: JSON.parse(JSON.stringify(store.bindings)),
    speed: JSON.parse(JSON.stringify(store.speed)),
    transition: store.transition
  }
}

export function applyData(d) {
  if (!d || typeof d !== 'object') throw new Error('文件内容不是有效的 JSON 对象')
  if (!d.path || !Array.isArray(d.path.points)) throw new Error('缺少 path.points 数组')
  const points = d.path.points.map(p => {
    if (!p || !Array.isArray(p.position) || p.position.length !== 3) {
      throw new Error('控制点格式不正确（需要 position: [x,y,z]）')
    }
    return { id: typeof p.id === 'string' ? p.id : genId(), position: p.position.map(Number) }
  })
  store.path = { closed: !!d.path.closed, points }
  // 绑定：仅保留指向已知目标的项
  const bindings = {}
  for (const [pid, b] of Object.entries(d.bindings || {})) {
    if (!points.some(p => p.id === pid)) continue
    if (!b || !targetDef(b.targetId)) continue
    bindings[pid] = {
      targetId: b.targetId,
      weight: Math.min(Math.max(Math.round(b.weight || 3), 1), 5),
      mode: b.mode === 'fixed' ? 'fixed' : 'follow',
      ...(Array.isArray(b.fixedPosition) ? { fixedPosition: b.fixedPosition.map(Number) } : {})
    }
  }
  store.bindings = bindings
  if (d.speed) {
    store.speed = {
      gear: Math.min(Math.max(Math.round(d.speed.gear || 3), 1), 5),
      keyframes: (Array.isArray(d.speed.keyframes) && d.speed.keyframes.length === 3)
        ? d.speed.keyframes.map(k => ({
            pos: Math.min(Math.max(+k.pos || 0.5, 0.05), 0.95),
            mult: Math.min(Math.max(+k.mult || 1, 0.2), 3)
          }))
        : [{ pos: 0.25, mult: 1 }, { pos: 0.5, mult: 1 }, { pos: 0.75, mult: 1 }]
    }
  }
  store.transition = Math.min(Math.max(+d.transition || 0.8, 0.3), 1.5)
  store.selectedPointId = null
  store.playback.distance = 0
  store.playback.playing = false
  store.preview.active = false
}

export function exportJSON() {
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'roam.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export async function importJSONFile(file) {
  store.importError = ''
  try {
    const text = await file.text()
    applyData(JSON.parse(text))
    return true
  } catch (e) {
    store.importError = '导入失败：' + e.message
    return false
  }
}

// ---------------- IndexedDB 持久化 ----------------

const DB_NAME = 'gujian-roam-tool'
const STORE_NAME = 'projects'
const KEY = 'current'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveToIDB() {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(serialize(), KEY)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    return true
  } catch (e) {
    console.warn('IndexedDB 保存失败', e)
    return false
  }
}

export async function loadFromIDB() {
  try {
    const db = await openDB()
    const data = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return data || null
  } catch (e) {
    console.warn('IndexedDB 读取失败', e)
    return null
  }
}

// 自动保存（防抖）
let saveTimer = null
watch(
  () => [store.path, store.bindings, store.speed, store.transition],
  () => {
    store.saveState = '保存中…'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const ok = await saveToIDB()
      store.saveState = ok ? '已自动保存 ' + new Date().toLocaleTimeString() : '保存失败'
    }, 600)
  },
  { deep: true }
)

// 首次启动：读 IndexedDB，没有则放一条演示路径
export async function initStore() {
  const saved = await loadFromIDB()
  if (saved) {
    try { applyData(saved); store.saveState = '已恢复上次保存'; return } catch (e) { console.warn(e) }
  }
  // 演示路径：环绕三重檐塔一圈的 8 个控制点
  const R = 13
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const y = 2.6 + Math.sin(a * 2) * 1.2 + (i % 2) * 0.8
    store.path.points.push({ id: genId(), position: [+(Math.cos(a) * R).toFixed(2), +y.toFixed(2), +(Math.sin(a) * R).toFixed(2)] })
  }
  // 演示绑定
  const pts = store.path.points
  store.bindings[pts[0].id] = { targetId: 'ta-sha', weight: 4, mode: 'follow' }
  store.bindings[pts[2].id] = { targetId: 'bian-e', weight: 3, mode: 'fixed', fixedPosition: [0, 4.9, 3.7] }
  store.bindings[pts[4].id] = { targetId: 'fei-niao', weight: 5, mode: 'follow' }
  store.bindings[pts[6].id] = { targetId: 'dou-gong', weight: 2, mode: 'follow' }
  store.saveState = '已载入演示路径'
}
