<script setup>
import { ref, computed, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { line as d3line } from 'd3-shape'
import { interpolate } from 'd3-interpolate'
import { timer as d3timer } from 'd3-timer'
import { easeCubicOut } from 'd3-ease'
import { style, LAYERS } from '../core/style'
import { getTile, findLoadedAncestor, cacheVersion } from '../core/tileCache'
import { placeLabels } from '../core/labels'
import {
  view, size, viewTransform, screenToWorld, worldToScreen, zoomTo,
  tileZoom, MINZ, MAXZ, WORLD, EXTENT,
} from '../core/viewState'

const wrapEl = ref(null)
const svgEl = ref(null)
const panning = ref(false)
const hover = ref(null)
const mouse = ref({ x: 0, y: 0 })

const lineGen = d3line().x((d) => d[0]).y((d) => d[1])

const ztLevel = computed(() => tileZoom())

// 按样式表 minZoom 过滤可见图层
const visibleLayers = computed(() =>
  LAYERS.filter((l) => view.zoom >= (style[l.key].minZoom ?? MINZ))
)

// 倾斜视角的分层偏移:每层在屏幕空间错开一点,近似立体堆叠
const tiltStep = computed(() => Math.sin((view.pitch * Math.PI) / 180) * 9)

// ---------- 视口内瓦片计算(缩放 / 旋转 / 倾斜时只取视口覆盖的瓦片) ----------
const displayTiles = computed(() => {
  cacheVersion.value // 瓦片加载完成时触发重算
  const zt = ztLevel.value
  const n = 2 ** zt
  const ts = WORLD / n
  const corners = [
    screenToWorld(0, 0),
    screenToWorld(size.w, 0),
    screenToWorld(0, size.h),
    screenToWorld(size.w, size.h),
  ]
  // 外扩一格,避免边缘瓦片频繁进出
  const minX = Math.min(...corners.map((p) => p.x)) - ts
  const maxX = Math.max(...corners.map((p) => p.x)) + ts
  const minY = Math.min(...corners.map((p) => p.y)) - ts
  const maxY = Math.max(...corners.map((p) => p.y)) + ts
  const tx0 = Math.max(0, Math.floor(minX / ts))
  const tx1 = Math.min(n - 1, Math.floor(maxX / ts))
  const ty0 = Math.max(0, Math.floor(minY / ts))
  const ty1 = Math.min(n - 1, Math.floor(maxY / ts))

  const out = []
  const seenAncestors = new Set()
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const e = getTile(zt, tx, ty)
      if (e.status === 'loaded') {
        out.push({ key: `${zt}/${tx}/${ty}`, zl: zt, tx, ty, data: e.data })
        continue
      }
      // 未加载到 / 不存在:用父级瓦片放大占位
      const a = findLoadedAncestor(zt, tx, ty, MINZ)
      if (a && !seenAncestors.has(`${a.zl}/${a.tx}/${a.ty}`)) {
        seenAncestors.add(`${a.zl}/${a.tx}/${a.ty}`)
        out.push({
          key: `${a.zl}/${a.tx}/${a.ty}`,
          zl: a.zl, tx: a.tx, ty: a.ty,
          data: a.data,
          fallback: true,
        })
      }
    }
  }
  return out
})

// ---------- 瓦片 -> SVG path(d 缓存,样式变化不影响几何) ----------
const renderCache = new Map()
function tileRender(t) {
  let r = renderCache.get(t.key)
  if (!r) {
    const ts = WORLD / 2 ** t.zl
    const layers = {}
    for (const [lk, feats] of Object.entries(t.data.layers)) {
      layers[lk] = feats.map((f) => ({
        id: f.id,
        props: f.props,
        d: f.rings
          ? f.rings.map((ring) => lineGen(ring) + 'Z').join('')
          : lineGen(f.geom),
      }))
    }
    r = {
      key: t.key,
      transform: `translate(${t.tx * ts} ${t.ty * ts}) scale(${ts / EXTENT})`,
      layers,
      fallback: !!t.fallback,
    }
    renderCache.set(t.key, r)
    if (renderCache.size > 600) renderCache.delete(renderCache.keys().next().value)
  }
  return r
}

const tileRenders = ref([])
const fading = ref([]) // 跨级切换时,上一级别瓦片淡出
let lastLevel = null
watchEffect(() => {
  const renders = displayTiles.value.map(tileRender)
  const lvl = ztLevel.value
  if (lastLevel !== null && lvl !== lastLevel && tileRenders.value.length) {
    const old = tileRenders.value
    fading.value = old
    setTimeout(() => {
      fading.value = []
    }, 350)
  }
  lastLevel = lvl
  tileRenders.value = renders
})

// ---------- 标注:收集候选 -> 优先级摆放 + 碰撞检测 + 降级 ----------
const labels = ref({ texts: [], dots: [] })
watchEffect(() => {
  if (panning.value) return // 拖拽中不重算,松手后统一摆放
  const zt = ztLevel.value
  const candMap = new Map()
  for (const t of displayTiles.value) {
    if (t.fallback || t.zl !== zt) continue
    const ts = WORLD / 2 ** t.zl
    for (const l of LAYERS) {
      const st = style[l.key]
      if (!st.label || view.zoom < st.minZoom) continue
      for (const f of t.data.layers[l.key] || []) {
        if (!f.props.name) continue
        const g = f.geom
        if (!g || g.length < 2) continue
        const mid = g[Math.floor(g.length / 2)]
        const s = worldToScreen(
          t.tx * ts + (mid[0] / EXTENT) * ts,
          t.ty * ts + (mid[1] / EXTENT) * ts
        )
        const cand = {
          id: f.id,
          name: f.props.name,
          length: f.props.length,
          x: s.x,
          y: s.y,
          layer: l.key,
          priority: st.label.priority,
          size: st.label.size,
          color: st.label.color,
          allowDot: st.label.allowDot,
        }
        // 同一要素跨瓦片出现多次,保留锚点离视口中心最近的一份
        const prev = candMap.get(f.id)
        if (
          !prev ||
          Math.hypot(s.x - size.w / 2, s.y - size.h / 2) <
            Math.hypot(prev.x - size.w / 2, prev.y - size.h / 2)
        ) {
          candMap.set(f.id, cand)
        }
      }
    }
  }
  labels.value = placeLabels([...candMap.values()], size.w, size.h)
})

// ---------- 样式绑定(样式表是响应式的,改动立即触发重绘) ----------
function pathStyle(lk) {
  const st = style[lk]
  const l = LAYERS.find((x) => x.key === lk)
  if (l.type === 'fill') {
    return { fill: st.color, fillOpacity: st.opacity, stroke: 'none' }
  }
  return {
    fill: 'none',
    stroke: st.color,
    strokeWidth: st.width,
    strokeDasharray: st.dash && st.dash.trim() ? st.dash : 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    opacity: st.opacity ?? 1,
  }
}

// ---------- 悬停高亮 + 提示 ----------
function onHover(f, t) {
  if (panning.value) return
  hover.value = {
    name: f.props.name,
    length: f.props.length,
    d: f.d,
    transform: t.transform,
  }
}

// ---------- 拖拽平移(rAF 合帧,拖拽中禁用要素指针事件保帧率) ----------
let drag = null
let lastEv = null
let raf = 0

function onDown(e) {
  if (e.button !== 0) return
  drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }
  panning.value = true
  hover.value = null
  svgEl.value.setPointerCapture(e.pointerId)
}

function onMove(e) {
  const rect = svgEl.value.getBoundingClientRect()
  mouse.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  if (!drag) return
  lastEv = e
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    if (!drag || !lastEv) return
    const k = 2 ** view.zoom
    const cp = Math.cos((view.pitch * Math.PI) / 180)
    const r = (view.rotation * Math.PI) / 180
    const dx = lastEv.clientX - drag.x
    const dy = lastEv.clientY - drag.y
    const rx = dx * Math.cos(r) + dy * Math.sin(r)
    const ry = (-dx * Math.sin(r) + dy * Math.cos(r)) / cp
    view.cx = drag.cx - rx / k
    view.cy = drag.cy - ry / k
  })
}

function onUp() {
  drag = null
  panning.value = false
}

// ---------- 缩放(滚轮 / 双击动画) ----------
function onWheel(e) {
  const rect = svgEl.value.getBoundingClientRect()
  zoomTo(
    view.zoom - e.deltaY * 0.002,
    e.clientX - rect.left,
    e.clientY - rect.top
  )
}

let anim = null
function onDbl(e) {
  const rect = svgEl.value.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  if (anim) anim.stop()
  const i = interpolate(view.zoom, view.zoom + 1)
  anim = d3timer((el) => {
    const p = easeCubicOut(Math.min(el / 300, 1))
    zoomTo(i(p), sx, sy)
    if (p >= 1) anim.stop()
  })
}

// ---------- 视口尺寸 ----------
let ro = null
onMounted(() => {
  ro = new ResizeObserver(() => {
    const r = wrapEl.value.getBoundingClientRect()
    size.w = Math.max(100, Math.round(r.width))
    size.h = Math.max(100, Math.round(r.height))
  })
  ro.observe(wrapEl.value)
})
onBeforeUnmount(() => {
  if (ro) ro.disconnect()
  if (raf) cancelAnimationFrame(raf)
  if (anim) anim.stop()
})
</script>

<template>
  <div class="map-wrap" ref="wrapEl">
    <svg
      ref="svgEl"
      :width="size.w"
      :height="size.h"
      :class="{ panning }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @wheel.prevent="onWheel"
      @dblclick.prevent="onDbl"
    >
      <rect class="bg" :width="size.w" :height="size.h" />

      <!-- 跨级切换:上一级别瓦片淡出 -->
      <g v-for="t in fading" :key="'fade-' + t.key" class="fade-out" :transform="viewTransform()">
        <g :transform="t.transform">
          <g v-for="l in LAYERS" :key="l.key">
            <path
              v-for="f in t.layers[l.key] || []"
              :key="f.id"
              :d="f.d"
              :style="pathStyle(l.key)"
              vector-effect="non-scaling-stroke"
            />
          </g>
        </g>
      </g>

      <!-- 当前级别:按图层分层绘制,倾斜时逐层偏移 -->
      <g
        v-for="(l, li) in visibleLayers"
        :key="l.key"
        :transform="viewTransform(li * tiltStep)"
      >
        <g
          v-for="t in tileRenders"
          :key="t.key"
          class="tile-g"
          :class="{ fallback: t.fallback }"
          :transform="t.transform"
        >
          <path
            v-for="f in t.layers[l.key] || []"
            :key="f.id"
            :d="f.d"
            class="feat"
            :style="pathStyle(l.key)"
            vector-effect="non-scaling-stroke"
            @mouseenter="onHover(f, t)"
            @mouseleave="hover = null"
          />
        </g>
      </g>

      <!-- 悬停高亮 -->
      <g v-if="hover" :transform="viewTransform()" pointer-events="none">
        <g :transform="hover.transform">
          <path :d="hover.d" class="hl" vector-effect="non-scaling-stroke" />
        </g>
      </g>

      <!-- 标注层(屏幕空间,文字保持水平) -->
      <g v-if="!panning" pointer-events="none">
        <text
          v-for="t in labels.texts"
          :key="t.id"
          :x="t.x"
          :y="t.y"
          class="lbl"
          :style="{ fontSize: t.size + 'px', fill: t.color }"
        >{{ t.name }}</text>
        <circle
          v-for="d in labels.dots"
          :key="d.id"
          :cx="d.x"
          :cy="d.y"
          r="3.5"
          class="dot"
          :style="{ fill: d.color }"
        />
      </g>
    </svg>

    <div
      v-if="hover && (hover.name || hover.length)"
      class="tip"
      :style="{ left: mouse.x + 14 + 'px', top: mouse.y + 14 + 'px' }"
    >
      <b>{{ hover.name || '未命名要素' }}</b>
      <span v-if="hover.length">长度 {{ hover.length }} km</span>
    </div>

    <div class="hud">
      z{{ view.zoom.toFixed(1) }} · 瓦片级别 z{{ ztLevel }} · 旋转
      {{ view.rotation.toFixed(0) }}° · 倾斜 {{ view.pitch.toFixed(0) }}°
    </div>
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
svg {
  display: block;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
svg.panning {
  cursor: grabbing;
}
svg.panning .feat {
  pointer-events: none; /* 拖拽中不做悬停命中,保帧率 */
}
.bg {
  fill: #eef0e6;
}
.tile-g {
  animation: tileIn 0.3s ease-out; /* 新瓦片淡入 */
}
.tile-g.fallback {
  opacity: 0.8;
}
.fade-out {
  animation: fadeOut 0.35s ease-in forwards;
  pointer-events: none;
}
@keyframes tileIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes fadeOut {
  from {
    opacity: 0.9;
  }
  to {
    opacity: 0;
  }
}
.hl {
  fill: none;
  stroke: #ffd54a;
  stroke-width: 6;
  opacity: 0.85;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.lbl {
  text-anchor: middle;
  dominant-baseline: central;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.85);
  stroke-width: 3px;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.dot {
  stroke: #fff;
  stroke-width: 1.5;
}
.tip {
  position: absolute;
  pointer-events: none;
  background: rgba(30, 34, 28, 0.88);
  color: #f2f2ee;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: nowrap;
  z-index: 5;
}
.hud {
  position: absolute;
  left: 10px;
  bottom: 10px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  color: #445;
  pointer-events: none;
}
</style>
