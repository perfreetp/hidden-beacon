<template>
  <div class="pano-view" ref="wrapRef">
    <canvas ref="canvasRef" class="pano-canvas"></canvas>
    <svg class="overlay" :width="size.w" :height="size.h" @mousedown="onBgDown" @wheel.prevent="onWheel">
      <defs>
        <marker id="arrowHead" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill="#ff5a5f"></path>
        </marker>
      </defs>
      <g v-for="m in screenMarkers" :key="m.uid" class="marker-layer"
         :class="{ selected: isSel(m.kind, m.data.id) }">
        <!-- 标注朝向箭头: 随视角旋转 -->
        <g v-if="m.kind === 'annotation' && m.arrow" @mousedown.stop="selectObj('annotation', m.data.id)">
          <line :x1="m.x" :y1="m.y" :x2="m.arrow.x" :y2="m.arrow.y"
                stroke="#ff5a5f" stroke-width="2.5" marker-end="url(#arrowHead)"></line>
          <circle :cx="m.x" :cy="m.y" r="4" fill="#ff5a5f"></circle>
        </g>
        <g :transform="`translate(${m.x},${m.y})`" class="marker"
           @mousedown.stop="onMarkerDown($event, m)" @click.stop="onMarkerClick(m)">
          <template v-if="m.kind === 'hotspot'">
            <circle r="13" :fill="m.data.color" fill-opacity="0.25"></circle>
            <circle r="7" :fill="m.data.color" stroke="#fff" stroke-width="2"></circle>
            <text y="-18" text-anchor="middle" class="marker-label">{{ m.data.label }}</text>
          </template>
          <template v-else-if="m.kind === 'annotation'">
            <rect x="-9" y="-9" width="18" height="18" rx="3" transform="rotate(45)"
                  fill="#2a9d8f" stroke="#fff" stroke-width="2"></rect>
            <text y="5" text-anchor="middle" class="marker-icon">设</text>
            <text y="28" text-anchor="middle" class="marker-label">{{ m.data.title }}</text>
          </template>
          <template v-else>
            <circle r="11" fill="#7b61ff" stroke="#fff" stroke-width="2"></circle>
            <text y="4" text-anchor="middle" class="marker-icon">💬</text>
          </template>
        </g>
      </g>
    </svg>

    <!-- 留言内联编辑 -->
    <div v-if="commentDraft" class="comment-editor" :style="{ left: commentDraft.x + 'px', top: commentDraft.y + 'px' }">
      <textarea v-model="commentDraft.text" rows="2" placeholder="给现场留一句话…" ref="commentInput"></textarea>
      <div class="ce-actions">
        <button class="btn small" @click="commentDraft = null">取消</button>
        <button class="btn small primary" @click="submitComment">发送</button>
      </div>
    </div>

    <!-- 留言气泡卡片 -->
    <div v-if="openComment" class="comment-card" :style="{ left: openComment.x + 'px', top: openComment.y + 'px' }">
      <div class="cc-head">
        <b>{{ openComment.data.author }}</b>
        <span>{{ fmtTime(openComment.data.time) }}</span>
        <button class="link" @click="openComment = null">✕</button>
      </div>
      <p>{{ openComment.data.text }}</p>
    </div>

    <div class="view-hint">{{ hintText }}</div>
  </div>
</template>

<script setup>
import { ref, shallowRef, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  state, currentPoint, setView, orbitDrag, pickPolar, projectPoint,
  addHotspot, addAnnotation, addComment, activateHotspot, cancelFlight
} from '../store/editor.js'
import { polarToVec, projectDirection, wrapLon, R2D, D2R } from '../lib/geo.js'
import { ViewRenderer } from '../lib/viewRenderer.js'
import { getEquirectImage } from '../store/editor.js'

const wrapRef = ref(null), canvasRef = ref(null), commentInput = ref(null)
const size = reactive({ w: 800, h: 600 })
const renderer = shallowRef(null)
const commentDraft = ref(null)
const openComment = ref(null)

const hintText = computed(() => ({
  pan: '左键拖动环视 · 滚轮缩放 · 方向键微调',
  hotspot: '在画面上单击放置热点, 拖圆点调整位置',
  annotation: '在设备上单击放置设备标注',
  comment: '在画面上单击, 给同事留一句话'
}[state.tool]))

const screenMarkers = computed(() => {
  const p = currentPoint.value
  if (!p) return []
  const out = []
  const push = (kind, data) => {
    const pr = projectPoint(data.lon, data.lat)
    if (!pr || Math.abs(pr.x) > 1.15 || Math.abs(pr.y) > 1.15) return
    const x = (pr.x * 0.5 + 0.5) * size.w
    const y = (0.5 - pr.y * 0.5) * size.h
    let arrow = null
    if (kind === 'annotation') {
      const anchor = polarToVec(data.lon, data.lat)
      const heading = polarToVec(data.heading, data.lat)
      const pa = projectDirection(anchor, state.view.yaw, state.view.pitch, state.view.fov)
      const ph = projectDirection(heading, state.view.yaw, state.view.pitch, state.view.fov)
      if (pa && ph) {
        const ax = (pa.x * 0.5 + 0.5) * size.w, ay = (0.5 - pa.y * 0.5) * size.h
        const hx = (ph.x * 0.5 + 0.5) * size.w, hy = (0.5 - ph.y * 0.5) * size.h
        const dx = hx - ax, dy = hy - ay
        const len = Math.hypot(dx, dy) || 1
        arrow = { x: ax + (dx / len) * 46, y: ay + (dy / len) * 46 }
      }
    }
    out.push({ uid: kind + data.id, kind, data, x, y, arrow })
  }
  p.hotspots.forEach(h => push('hotspot', h))
  p.annotations.forEach(a => push('annotation', a))
  p.comments.forEach(c => push('comment', c))
  return out
})

function isSel(kind, id) { return state.selected.kind === kind && state.selected.id === id }
function selectObj(kind, id) { state.selected = { kind, id } }
function fmtTime(t) { return new Date(t).toLocaleString('zh-CN', { hour12: false }) }

/* ---------- 渲染循环 ---------- */
let dirty = true, raf = 0, settleTimer = 0
function markDirty(full = false) {
  dirty = true
  if (full) { clearTimeout(settleTimer); settleTimer = setTimeout(() => { dirty = true; lowQuality = false }, 90) }
}
let lowQuality = false

function loop() {
  raf = requestAnimationFrame(loop)
  if (!dirty && !state.transition.active) return
  const r = renderer.value
  if (!r || !r.srcData) return
  const full = !lowQuality && !state.transition.active
  r.render(state.view.yaw, state.view.pitch, state.view.fov, size.w, size.h, full)
  dirty = false
}

function syncSource() {
  const p = currentPoint.value
  const img = p && getEquirectImage(p.id)
  if (img && renderer.value) { renderer.value.setSource(img); markDirty() }
}
let lastPoint = null

onMounted(() => {
  renderer.value = new ViewRenderer(canvasRef.value)
  size.w = wrapRef.value.clientWidth
  size.h = wrapRef.value.clientHeight
  const ro = new ResizeObserver(() => {
    size.w = wrapRef.value.clientWidth
    size.h = wrapRef.value.clientHeight
    markDirty()
  })
  ro.observe(wrapRef.value)
  resizeObserver = ro
  // 源图异步载入后同步
  stopWatch = setInterval(() => {
    if (lastPoint !== state.currentPointId) { lastPoint = state.currentPointId; syncSource() }
    else if (renderer.value && !renderer.value.srcData) syncSource()
  }, 200)
  raf = requestAnimationFrame(loop)
  window.addEventListener('keydown', onKeyDown)
})
let resizeObserver, stopWatch

onBeforeUnmount(() => {
  cancelAnimationFrame(raf); resizeObserver?.disconnect(); clearInterval(stopWatch)
  window.removeEventListener('keydown', onKeyDown)
  clearTimeout(settleTimer)
})

/* ---------- 交互 ---------- */
const drag = reactive({ mode: null, startX: 0, startY: 0, moved: false, kind: null, data: null })

function eventPos(e) {
  const rect = wrapRef.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
function toNorm(x, y) { return { nx: (x / size.w) * 2 - 1, ny: 1 - (y / size.h) * 2 } }

function onBgDown(e) {
  if (e.button !== 0) return
  const { x, y } = eventPos(e)
  Object.assign(drag, { mode: 'panOrPlace', startX: x, startY: y, moved: false, lastX: x, lastY: y })
  window.addEventListener('mousemove', onWinMove)
  window.addEventListener('mouseup', onWinUp)
}

function onMarkerDown(e, m) {
  cancelFlight()
  const { x, y } = eventPos(e)
  if (m.kind === 'hotspot' || m.kind === 'annotation') {
    Object.assign(drag, { mode: 'dragObj', startX: x, startY: y, moved: false, kind: m.kind, data: m.data, lastX: x, lastY: y })
  } else {
    Object.assign(drag, { mode: 'panOrPlace', startX: x, startY: y, moved: false, lastX: x, lastY: y })
  }
  selectObj(m.kind, m.data.id)
  window.addEventListener('mousemove', onWinMove)
  window.addEventListener('mouseup', onWinUp)
}

function onWinMove(e) {
  const { x, y } = eventPos(e)
  const dx = x - drag.lastX, dy = y - drag.lastY
  drag.lastX = x; drag.lastY = y
  if (Math.hypot(x - drag.startX, y - drag.startY) > 4) drag.moved = true

  if (drag.mode === 'dragObj') {
    lowQuality = true; markDirty()
    const { nx, ny } = toNorm(x, y)
    const [lon, lat] = pickPolar(nx, ny) // 精确反投影, 两极不跑偏
    drag.data.lon = lon; drag.data.lat = lat
  } else if (drag.mode === 'panOrPlace' && drag.moved) {
    lowQuality = true; markDirty()
    orbitDrag(dx, dy)
  }
}

function onWinUp(e) {
  window.removeEventListener('mousemove', onWinMove)
  window.removeEventListener('mouseup', onWinUp)
  if (drag.mode === 'dragObj') { lowQuality = false; markDirty(true); return }
  if (!drag.moved) handleClick(e)
  lowQuality = false; markDirty(true)
}

function handleClick(e) {
  const { x, y } = eventPos(e)
  const { nx, ny } = toNorm(x, y)
  const [lon, lat] = pickPolar(nx, ny)
  if (state.tool === 'hotspot') addHotspot(state.currentPointId, lon, lat)
  else if (state.tool === 'annotation') addAnnotation(state.currentPointId, lon, lat)
  else if (state.tool === 'comment') {
    commentDraft.value = { x: Math.min(x, size.w - 260), y: Math.max(8, y - 90), lon, lat, text: '' }
    nextTick(() => commentInput.value?.focus())
  }
}

function submitComment() {
  const d = commentDraft.value
  if (d && d.text.trim()) addComment(state.currentPointId, d.lon, d.lat, d.text.trim())
  commentDraft.value = null
}

function onMarkerClick(m) {
  if (drag.moved) return
  if (m.kind === 'hotspot') activateHotspot(m.data)
  else if (m.kind === 'comment') openComment.value = { ...m, x: Math.min(m.x, size.w - 280), y: Math.max(8, m.y - 110) }
}

function onWheel(e) {
  cancelFlight()
  setView(state.view.yaw, state.view.pitch, state.view.fov + Math.sign(e.deltaY) * 5)
  markDirty(true)
}

function onKeyDown(e) {
  if (commentDraft.value || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return
  const step = e.shiftKey ? 5 : 2
  if (e.key === 'ArrowLeft') { state.view.yaw = wrapLon(state.view.yaw - step); markDirty() }
  else if (e.key === 'ArrowRight') { state.view.yaw = wrapLon(state.view.yaw + step); markDirty() }
  else if (e.key === 'ArrowUp') { state.view.pitch = Math.max(-89.9, state.view.pitch + step); markDirty() }
  else if (e.key === 'ArrowDown') { state.view.pitch = Math.min(89.9, state.view.pitch - step); markDirty() }
}
</script>

<style scoped>
.pano-view { position: relative; flex: 1; min-height: 0; overflow: hidden; background: #0b0f14; }
.pano-canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: auto; }
.overlay { position: absolute; inset: 0; cursor: grab; user-select: none; }
.overlay:active { cursor: grabbing; }
.marker { cursor: pointer; }
.marker-label { fill: #fff; font-size: 13px; font-weight: 600; paint-order: stroke; stroke: rgba(0,0,0,0.7); stroke-width: 3px; }
.marker-icon { fill: #fff; font-size: 12px; font-weight: 700; pointer-events: none; }
.marker-layer.selected .marker-label { fill: #ffd166; }
.view-hint {
  position: absolute; left: 12px; bottom: 10px; font-size: 12px; color: #c9d4e0;
  background: rgba(10,16,22,0.65); padding: 5px 10px; border-radius: 6px; pointer-events: none;
}
.comment-editor, .comment-card {
  position: absolute; width: 250px; background: #1b2430; border: 1px solid #334155;
  border-radius: 10px; padding: 10px; color: #e6edf3; z-index: 20; box-shadow: 0 10px 30px rgba(0,0,0,0.4);
}
.comment-editor textarea { width: 100%; box-sizing: border-box; resize: vertical; background: #0f1620; color: #e6edf3; border: 1px solid #334155; border-radius: 6px; padding: 6px; font: inherit; }
.ce-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.cc-head { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #9fb0c3; }
.cc-head .link { margin-left: auto; background: none; border: 0; color: #9fb0c3; cursor: pointer; }
.comment-card p { margin: 6px 0 0; font-size: 13px; line-height: 1.5; }
.btn.small { padding: 3px 10px; font-size: 12px; }
.btn.primary { background: #2f81f7; color: #fff; border-color: #2f81f7; }
</style>
