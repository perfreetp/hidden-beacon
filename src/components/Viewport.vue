<template>
  <div ref="wrap" class="viewport">
    <canvas ref="canvasEl" class="pc-canvas"></canvas>
    <div class="hud" v-show="hudVisible">
      第 {{ hud.seg + 1 }} / {{ hud.segCount }} 段 · 剩余 {{ hud.remain.toFixed(1) }} m（{{ hud.remainPct.toFixed(0) }}%）
    </div>
    <div class="preview-tag" v-show="store.preview.active">衔接预览中 · 过渡 {{ store.transition.toFixed(1) }}s · 按 Esc 退出</div>
    <div class="tip">{{ tipText }}</div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, reactive, computed, watch } from 'vue'
import * as pc from 'playcanvas'
import { store, getSpline, addPoint, removePoint, liveTargetPos } from '../store'
import { speedAt, smoothstep, norm3, nlerp3 } from '../spline'
import { buildScene } from '../scene'
import { TARGET_DEFS } from '../targets'

const wrap = ref(null)
const canvasEl = ref(null)
const hud = reactive({ seg: 0, segCount: 0, remain: 0, remainPct: 0 })

let app = null
let cam = null
let spline = null
let scene = null
let ro = null
const gizmos = new Map() // pointId -> {entity, material}

const orbit = { yaw: 0.85, pitch: 0.42, dist: 30, focus: new pc.Vec3(0, 4, 0) }
let drag = null
let smDir = null       // 播放时的平滑朝向
let pvPhase = 0        // 衔接预览相位
let pvDir = 1

const hudVisible = computed(() =>
  (store.playing || store.playback.playing || store.playback.distance > 0.01) && hud.segCount > 0 && !store.preview.active
)

const tipText = computed(() => {
  if (store.preview.active) return ''
  if (store.playback.playing) return '漫游播放中…（在漫游页暂停可返回视角控制）'
  if (store.tab === 'path') return '左键点击模型/地面添加控制点 · 拖拽控制点移动 · Alt+拖拽调高度 · 拖动空白处旋转视角 · 滚轮缩放 · Delete 删除选中点'
  return '拖动旋转视角 · 滚轮缩放'
})

// ---------------- 初始化 ----------------

onMounted(() => {
  const canvas = canvasEl.value
  app = new pc.Application(canvas, {
    graphicsDeviceOptions: { antialias: true, alpha: false }
  })
  app.setCanvasFillMode(pc.FILLMODE_NONE)
  app.scene.gammaCorrection = pc.GAMMA_SRGB
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio, 2)

  cam = new pc.Entity('camera')
  cam.addComponent('camera', { clearColor: new pc.Color(0.13, 0.16, 0.2), farClip: 500 })
  app.root.addChild(cam)
  applyOrbit()

  scene = buildScene(app)

  // 尺寸自适应
  ro = new ResizeObserver(resize)
  ro.observe(wrap.value)
  resize()

  // 输入
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeyDown)

  rebuildSpline()
  watch(() => store.path, rebuildSpline, { deep: true })
  watch(() => store.playback.playing, v => {
    if (v) {
      smDir = null
      store.preview.active = false
      if (!store.path.closed && spline && store.playback.distance >= spline.total - 1e-3) {
        store.playback.distance = 0
      }
    }
  })
  watch(() => store.preview.active, v => { pvPhase = 0; pvDir = 1; if (v) store.playback.playing = false })
  watch(() => store.focusReq.n, () => {
    const e = scene.targetEnts.get(store.focusReq.id)
    if (e) { orbit.focus = e.getPosition().clone(); orbit.dist = 14 }
  })

  app.on('update', update)
  app.start()
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('keydown', onKeyDown)
  ro && ro.disconnect()
  app && app.destroy()
})

function resize() {
  if (!wrap.value || !app) return
  const w = wrap.value.clientWidth, h = wrap.value.clientHeight
  if (w > 0 && h > 0) app.graphicsDevice.resizeCanvas(w, h)
}

// ---------------- 样条与 Gizmo 同步 ----------------

function rebuildSpline() {
  spline = getSpline()
  syncGizmos()
}

function syncGizmos() {
  const ids = new Set(store.path.points.map(p => p.id))
  for (const [id, g] of gizmos) {
    if (!ids.has(id)) { g.entity.destroy(); gizmos.delete(id) }
  }
  for (const p of store.path.points) {
    if (!gizmos.has(p.id)) {
      const e = new pc.Entity('cp-' + p.id)
      e.addComponent('model', { type: 'sphere' })
      e.setLocalScale(0.5, 0.5, 0.5)
      const m = new pc.StandardMaterial()
      m.diffuse = new pc.Color().fromString('#ff9f1c')
      m.emissive = new pc.Color().fromString('#ff9f1c')
      m.emissiveTint = true
      m.update()
      e.model.meshInstances.forEach(mi => { mi.material = m })
      app.root.addChild(e)
      gizmos.set(p.id, { entity: e, material: m })
    }
  }
}

// ---------------- 相机轨道 ----------------

function applyOrbit() {
  const { yaw, pitch, dist, focus } = orbit
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  cam.setPosition(
    focus.x + dist * cp * Math.cos(yaw),
    focus.y + dist * sp,
    focus.z + dist * cp * Math.sin(yaw)
  )
  cam.lookAt(focus)
}

// ---------------- 输入 ----------------

function getRay(e) {
  const canvas = canvasEl.value
  const rect = canvas.getBoundingClientRect()
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const ny = 1 - ((e.clientY - rect.top) / rect.height) * 2
  const proj = cam.camera.projectionMatrix
  const view = new pc.Mat4().copy(cam.getWorldTransform()).invert()
  const inv = new pc.Mat4().mul2(proj, view).invert()
  const a = inv.transformPoint(new pc.Vec3(nx, ny, -1))
  const b = inv.transformPoint(new pc.Vec3(nx, ny, 1))
  return { origin: a, dir: b.sub(a).normalize() }
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z
  const b = ox * d.x + oy * d.y + oz * d.z
  const cc = ox * ox + oy * oy + oz * oz - r * r
  const disc = b * b - cc
  if (disc < 0) return -1
  const t = -b - Math.sqrt(disc)
  return t > 0 ? t : -1
}

function pickGizmo(ray) {
  let best = null, bestT = Infinity
  for (const [id, g] of gizmos) {
    const t = raySphere(ray.origin, ray.dir, g.entity.getPosition(), 0.45)
    if (t > 0 && t < bestT) { bestT = t; best = id }
  }
  return best
}

const _hitPoint = new pc.Vec3()
function pickScene(ray) {
  const pcRay = new pc.Ray(ray.origin, ray.dir)
  let best = null, bestT = Infinity
  for (const mi of scene.pickables) {
    if (mi.aabb.intersectsRay(pcRay, _hitPoint)) {
      const t = _hitPoint.clone().sub(ray.origin).dot(ray.dir)
      if (t < bestT) { bestT = t; best = [_hitPoint.x, _hitPoint.y, _hitPoint.z] }
    }
  }
  return best
}

function onPointerDown(e) {
  if (store.playback.playing || store.preview.active) return
  canvasEl.value.setPointerCapture(e.pointerId)
  const ray = getRay(e)
  if (store.tab === 'path' && e.button === 0) {
    const gid = pickGizmo(ray)
    if (gid) {
      store.selectedPointId = gid
      const p = store.path.points.find(p => p.id === gid)
      drag = { type: 'gizmo', id: gid, vertical: e.altKey, y: p.position[1] }
      return
    }
  }
  drag = { type: 'orbit', x: e.clientX, y: e.clientY, moved: 0, button: e.button, ray }
}

function onPointerMove(e) {
  if (!drag) return
  if (drag.type === 'gizmo') {
    const p = store.path.points.find(p => p.id === drag.id)
    if (!p) { drag = null; return }
    const ray = getRay(e)
    let hit = null
    if (drag.vertical || e.altKey) {
      // 竖直平面（面向相机）
      const cp = cam.getPosition()
      const n = new pc.Vec3(cp.x - p.position[0], 0, cp.z - p.position[2]).normalize()
      const denom = ray.dir.dot(n)
      if (Math.abs(denom) > 1e-5) {
        const t = new pc.Vec3(p.position[0] - ray.origin.x, 0, p.position[2] - ray.origin.z).dot(n) / denom
        hit = ray.origin.clone().add(ray.dir.clone().mulScalar(t))
      }
      if (hit) p.position[1] = +Math.max(0.2, hit.y).toFixed(3)
    } else {
      // 水平面 y = 点当前高度
      if (Math.abs(ray.dir.y) > 1e-5) {
        const t = (p.position[1] - ray.origin.y) / ray.dir.y
        if (t > 0) hit = ray.origin.clone().add(ray.dir.clone().mulScalar(t))
      }
      if (hit) {
        p.position[0] = +hit.x.toFixed(3)
        p.position[2] = +hit.z.toFixed(3)
      }
    }
  } else if (drag.type === 'orbit') {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    drag.moved += Math.abs(dx) + Math.abs(dy)
    drag.x = e.clientX; drag.y = e.clientY
    orbit.yaw -= dx * 0.005
    orbit.pitch = Math.min(1.5, Math.max(0.05, orbit.pitch + dy * 0.005))
    applyOrbit()
  }
}

function onPointerUp(e) {
  if (drag && drag.type === 'orbit' && drag.moved < 5 && drag.button === 0 && store.tab === 'path'
      && !store.playback.playing && !store.preview.active) {
    const hit = pickScene(drag.ray)
    if (hit) addPoint(hit)
  }
  drag = null
}

function onWheel(e) {
  if (store.playback.playing || store.preview.active) return
  e.preventDefault()
  orbit.dist = Math.min(90, Math.max(5, orbit.dist * (1 + e.deltaY * 0.001)))
  applyOrbit()
}

function onKeyDown(e) {
  if (e.key === 'Escape' && store.preview.active) { store.preview.active = false; return }
  if (e.key === 'Delete' && store.tab === 'path' && store.selectedPointId && !store.playback.playing) {
    removePoint(store.selectedPointId)
  }
}

// ---------------- 朝向计算 ----------------

function targetPosOf(binding) {
  if (binding.mode === 'fixed' && binding.fixedPosition) return binding.fixedPosition
  const e = scene.targetEnts.get(binding.targetId)
  if (!e) return null
  const p = e.getPosition()
  return [p.x, p.y, p.z]
}

function pointLookDir(i) {
  const pt = store.path.points[i]
  const b = store.bindings[pt.id]
  if (b && b.targetId) {
    const tp = targetPosOf(b)
    if (tp) return norm3([tp[0] - pt.position[0], tp[1] - pt.position[1], tp[2] - pt.position[2]])
  }
  return spline.tangentAtDistance(spline.jointDistance(i))
}

function weightOf(i) {
  const b = store.bindings[store.path.points[i].id]
  return b ? b.weight : 3
}

// 弧长 d 处的期望注视方向（相邻控制点目标按权重混合）
function lookDirAt(d) {
  const { seg, u } = spline.locate(d)
  const n = store.path.points.length
  const iA = seg, iB = (seg + 1) % n
  const dirA = pointLookDir(iA), dirB = pointLookDir(iB)
  const wA = weightOf(iA), wB = weightOf(iB)
  const eA = Math.pow(1 - u, wA), eB = Math.pow(u, wB)
  return nlerp3(dirA, dirB, eB / (eA + eB + 1e-9))
}

// ---------------- 每帧更新 ----------------

const C_PATH = new pc.Color(0.3, 0.85, 1)
const C_TAN = new pc.Color(1, 0.85, 0.2)
const C_LOOK = new pc.Color(0.4, 1, 0.55)
const C_GRID = new pc.Color(0.32, 0.36, 0.4)
const C_PREV_A = new pc.Color(1, 0.4, 0.4)
const C_PREV_B = new pc.Color(0.4, 1, 0.6)

function update(dt) {
  scene.update(dt)

  // 目标实时位置写入共享表（供面板快照「固定」坐标）
  for (const def of TARGET_DEFS) {
    const e = scene.targetEnts.get(def.id)
    if (e) { const p = e.getPosition(); liveTargetPos[def.id] = [p.x, p.y, p.z] }
  }

  // gizmo 位置与选中色（播放/预览时隐藏，避免遮挡相机）
  const hideGizmos = store.playback.playing || store.preview.active
  for (const p of store.path.points) {
    const g = gizmos.get(p.id)
    if (!g) continue
    g.entity.enabled = !hideGizmos
    g.entity.setPosition(p.position[0], p.position[1], p.position[2])
    const sel = p.id === store.selectedPointId
    const c = sel ? '#2ec4b6' : '#ff9f1c'
    g.material.diffuse = new pc.Color().fromString(c)
    g.material.emissive = new pc.Color().fromString(c)
    g.material.update()
    const s = sel ? 0.62 : 0.5
    g.entity.setLocalScale(s, s, s)
  }

  // 目标高亮
  for (const def of TARGET_DEFS) {
    const e = scene.targetEnts.get(def.id)
    if (e && def.id === store.highlightTargetId) {
      const s = 0.6 + Math.sin(performance.now() * 0.012) * 0.15
      e.setLocalScale(s, s, s)
    }
  }

  drawGrid()
  drawPath()
  if (store.tab === 'target') drawTargetLinks()

  if (store.preview.active && spline && spline.segCount > 0) {
    runPreview(dt)
  } else if (store.playback.playing && spline && spline.total > 0) {
    runPlayback(dt)
  }

  updateHud()
}

function drawGrid() {
  for (let i = -30; i <= 30; i += 3) {
    app.drawLine(new pc.Vec3(i, 0.01, -30), new pc.Vec3(i, 0.01, 30), C_GRID, false)
    app.drawLine(new pc.Vec3(-30, 0.01, i), new pc.Vec3(30, 0.01, i), C_GRID, false)
  }
}

function drawPath() {
  if (!spline || spline.segCount === 0) return
  const steps = 24
  for (let s = 0; s < spline.segCount; s++) {
    let prev = spline.pointAt(s, 0)
    for (let i = 1; i <= steps; i++) {
      const c = spline.pointAt(s, i / steps)
      app.drawLine(new pc.Vec3(...prev), new pc.Vec3(...c), C_PATH, false)
      prev = c
    }
    // 每段中点切线箭头
    const m = spline.pointAt(s, 0.5)
    const t = norm3(spline.tangentAt(s, 0.5))
    const tip = [m[0] + t[0] * 1.6, m[1] + t[1] * 1.6, m[2] + t[2] * 1.6]
    app.drawLine(new pc.Vec3(...m), new pc.Vec3(...tip), C_TAN, false)
    // 箭头翼
    const side = norm3([t[2], 0, -t[0]])
    for (const sgn of [1, -1]) {
      app.drawLine(
        new pc.Vec3(...tip),
        new pc.Vec3(
          tip[0] - t[0] * 0.45 + side[0] * 0.22 * sgn,
          tip[1] - t[1] * 0.45 + 0.1,
          tip[2] - t[2] * 0.45 + side[2] * 0.22 * sgn
        ),
        C_TAN, false
      )
    }
  }
}

function drawTargetLinks() {
  for (const p of store.path.points) {
    const b = store.bindings[p.id]
    if (!b || !b.targetId) continue
    const tp = targetPosOf(b)
    if (!tp) continue
    const def = TARGET_DEFS.find(d => d.id === b.targetId)
    const c = new pc.Color().fromString(def ? def.color : '#ffffff')
    app.drawLine(new pc.Vec3(...p.position), new pc.Vec3(...tp), c, false)
  }
}

function runPlayback(dt) {
  const pb = store.playback
  const frac = pb.distance / spline.total
  const v = speedAt(Math.min(Math.max(frac, 0), 1), store.speed)
  pb.distance += v * dt
  if (store.path.closed) {
    pb.distance = spline.wrapDist(pb.distance)
  } else if (pb.distance >= spline.total) {
    pb.distance = spline.total
    pb.playing = false
  }
  const pos = spline.pointAtDistance(pb.distance)
  const desired = lookDirAt(pb.distance)
  if (!smDir) smDir = desired
  // 衔接过渡：朝向按过渡时间常数平滑（0.3s 快切 ~ 1.5s 缓融）
  const k = 1 - Math.exp(-dt / Math.max(store.transition / 3, 0.02))
  smDir = nlerp3(smDir, desired, k)
  cam.setPosition(pos[0], pos[1], pos[2])
  cam.lookAt(pos[0] + smDir[0], pos[1] + smDir[1], pos[2] + smDir[2])
}

function runPreview(dt) {
  const j = Math.min(store.preview.joint, spline.segCount)
  const dj = spline.jointDistance(j)
  const back = Math.min(1.5, spline.total * 0.03)
  const dA = lookDirAt(spline.wrapDist(dj - back))
  const dB = lookDirAt(spline.wrapDist(dj + back))
  pvPhase += (dt * pvDir) / Math.max(store.transition, 0.05)
  if (pvPhase >= 1) { pvPhase = 1; pvDir = -1 }
  if (pvPhase <= 0) { pvPhase = 0; pvDir = 1 }
  const dir = nlerp3(dA, dB, smoothstep(pvPhase))
  const pos = spline.pointAtDistance(dj)
  cam.setPosition(pos[0], pos[1], pos[2])
  cam.lookAt(pos[0] + dir[0], pos[1] + dir[1], pos[2] + dir[2])
  // 前后两段朝向参考线
  app.drawLine(new pc.Vec3(...pos), new pc.Vec3(pos[0] + dA[0] * 4, pos[1] + dA[1] * 4, pos[2] + dA[2] * 4), C_PREV_A, false)
  app.drawLine(new pc.Vec3(...pos), new pc.Vec3(pos[0] + dB[0] * 4, pos[1] + dB[1] * 4, pos[2] + dB[2] * 4), C_PREV_B, false)
}

function updateHud() {
  if (!spline || spline.segCount === 0) { hud.segCount = 0; return }
  const d = store.playback.distance
  const { seg } = spline.locate(d)
  hud.seg = seg
  hud.segCount = spline.segCount
  hud.remain = Math.max(0, spline.total - d)
  hud.remainPct = spline.total > 0 ? (hud.remain / spline.total) * 100 : 0
  store.playback.hud = { seg: hud.seg, segCount: hud.segCount, remain: hud.remain, remainPct: hud.remainPct }
}
</script>

<style scoped>
.viewport { position: relative; flex: 1; min-width: 0; overflow: hidden; background: #212830; }
.pc-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
.hud {
  position: absolute; top: 12px; left: 12px; padding: 6px 12px;
  background: rgba(10, 14, 18, 0.72); color: #7ee8fa; border-radius: 6px;
  font-size: 14px; pointer-events: none;
}
.preview-tag {
  position: absolute; top: 12px; left: 12px; padding: 6px 12px;
  background: rgba(80, 40, 10, 0.8); color: #ffd166; border-radius: 6px;
  font-size: 13px; pointer-events: none;
}
.tip {
  position: absolute; bottom: 10px; left: 12px; right: 12px;
  color: rgba(255, 255, 255, 0.55); font-size: 12px; pointer-events: none;
}
</style>
