<template>
  <div class="eq-map">
    <div class="eq-head">
      <span>等距柱状展开图 · 经纬坐标编辑</span>
      <span class="eq-tip">点击放置 / 拖动标记改经纬; 投影框中心可拖动环视</span>
    </div>
    <svg ref="svgRef" :viewBox="`0 0 ${W} ${H}`" class="eq-svg"
         @mousedown="onDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onUp">
      <image v-if="eqUrl" :href="eqUrl" :width="W" :height="H" preserveAspectRatio="none" opacity="0.85"></image>
      <rect v-else :width="W" :height="H" fill="#111823"></rect>
      <g class="grid-layer" ref="gridRef"></g>
      <g class="frustum-layer" ref="frustumRef"></g>
      <g class="marker-layer">
        <g v-for="m in mapMarkers" :key="m.kind + m.data.id"
           :transform="`translate(${xy(m.data.lon, m.data.lat).x},${xy(m.data.lon, m.data.lat).y})`"
           class="map-marker" :class="{ selected: isSel(m.kind, m.data.id) }"
           @mousedown.stop="startDragObj($event, m)">
          <template v-if="m.kind === 'hotspot'">
            <circle r="11" :fill="m.data.color" stroke="#fff" stroke-width="1.5"></circle>
            <text y="4" text-anchor="middle" class="mm-icon">热</text>
          </template>
          <template v-else-if="m.kind === 'annotation'">
            <rect x="-9" y="-9" width="18" height="18" rx="2" transform="rotate(45)" fill="#2a9d8f" stroke="#fff" stroke-width="1.5"></rect>
            <text y="4" text-anchor="middle" class="mm-icon">设</text>
          </template>
          <template v-else>
            <circle r="10" fill="#7b61ff" stroke="#fff" stroke-width="1.5"></circle>
            <text y="4" text-anchor="middle" class="mm-icon">言</text>
          </template>
          <text y="-16" text-anchor="middle" class="mm-label">{{ labelOf(m) }}</text>
        </g>
      </g>
      <g class="axis-labels" ref="labelRef"></g>
    </svg>
    <div class="eq-coord" v-if="hoverCoord">
      经度 {{ hoverCoord.lon.toFixed(1) }}° / 纬度 {{ hoverCoord.lat.toFixed(1) }}°
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { state, currentPoint, setView, addHotspot, addAnnotation, addComment, cancelFlight } from '../store/editor.js'
import { unprojectToPolar, clamp, wrapLon } from '../lib/geo.js'

const W = state.settings.mapWidth, H = state.settings.mapHeight
const svgRef = ref(null), gridRef = ref(null), frustumRef = ref(null), labelRef = ref(null)
const hoverCoord = ref(null)

const eqUrl = computed(() => currentPoint.value?.equirect || '')
const mapMarkers = computed(() => {
  const p = currentPoint.value
  if (!p) return []
  return [
    ...p.hotspots.map(d => ({ kind: 'hotspot', data: d })),
    ...p.annotations.map(d => ({ kind: 'annotation', data: d })),
    ...p.comments.map(d => ({ kind: 'comment', data: d }))
  ]
})
const isSel = (k, id) => state.selected.kind === k && state.selected.id === id
const labelOf = m => m.kind === 'hotspot' ? m.data.label : m.kind === 'annotation' ? m.data.title : '留言'

function xy(lon, lat) { return { x: ((lon + 180) / 360) * W, y: ((90 - lat) / 180) * H } }
function lonLatFromEvent(e) {
  const pt = d3.pointer(e, svgRef.value)
  const vb = svgRef.value.viewBox.baseVal
  const x = pt[0] * (vb.width / svgRef.value.clientWidth)
  const y = pt[1] * (vb.height / svgRef.value.clientHeight)
  return { lon: wrapLon((x / W) * 360 - 180), lat: clamp(90 - (y / H) * 180, -89.9, 89.9), x, y }
}

/* ---------- D3 经纬网格 ---------- */
const projection = d3.geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2])
const path = d3.geoPath(projection)

function drawGrid() {
  const g = d3.select(gridRef.value)
  g.selectAll('*').remove()
  const graticule = d3.geoGraticule().step([15, 15])
  g.append('path').datum(graticule()).attr('d', path)
    .attr('fill', 'none').attr('stroke', 'rgba(120,170,255,0.45)').attr('stroke-width', 1)
  g.append('path').datum(graticule.outline()).attr('d', path)
    .attr('fill', 'none').attr('stroke', 'rgba(120,170,255,0.8)').attr('stroke-width', 2)
  // 赤道与本初子午线加粗
  g.append('path').datum({ type: 'LineString', coordinates: [[-180, 0], [180, 0]] })
    .attr('d', path).attr('stroke', 'rgba(255,209,102,0.9)').attr('stroke-width', 1.5)
  g.append('path').datum({ type: 'LineString', coordinates: [[0, -90], [0, 90]] })
    .attr('d', path).attr('stroke', 'rgba(255,209,102,0.9)').attr('stroke-width', 1.5)
}

function drawAxisLabels() {
  const g = d3.select(labelRef.value)
  g.selectAll('*').remove()
  for (let lon = -180; lon <= 180; lon += 30) {
    const { x } = xy(lon, 0)
    g.append('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle')
      .attr('class', 'axis-text').text(`${lon}°`)
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const { y } = xy(0, lat)
    g.append('text').attr('x', 6).attr('y', y - 4).attr('class', 'axis-text').text(`${lat}°`)
  }
}

/* ---------- D3 当前视锥投影框 ---------- */
function frustumRing() {
  const { yaw, pitch, fov } = state.view
  const N = 36
  const ring = []
  const edge = (a, b) => {
    for (let i = 0; i < N; i++) {
      const t = i / N
      const nx = a[0] + (b[0] - a[0]) * t
      const ny = a[1] + (b[1] - a[1]) * t
      ring.push(unprojectToPolar(nx, ny, yaw, pitch, fov))
    }
  }
  edge([-1, 1], [1, 1])    // 上
  edge([1, 1], [1, -1])    // 右
  edge([1, -1], [-1, -1])  // 下
  edge([-1, -1], [-1, 1])  // 左
  ring.push(ring[0])
  return ring.map(([lon, lat]) => [lon, lat])
}

function drawFrustum() {
  const g = d3.select(frustumRef.value)
  g.selectAll('*').remove()
  const ring = frustumRing()
  // d3 geoPath 自带反经线切割, 避免视框跨过 ±180° 时横穿整图
  const poly = { type: 'Polygon', coordinates: [ring] }
  g.append('path').datum(poly).attr('d', path)
    .attr('fill', 'rgba(47,129,247,0.18)').attr('stroke', '#58a6ff')
    .attr('stroke-width', 2.5).attr('stroke-dasharray', '8 5')
  // 中心(朝向)与北向参考线
  const c = xy(state.view.yaw, state.view.pitch)
  const top = unprojectToPolar(0, 1, state.view.yaw, state.view.pitch, state.view.fov)
  const t2 = xy(top[0], top[1])
  g.append('line').attr('x1', c.x).attr('y1', c.y).attr('x2', t2.x).attr('y2', t2.y)
    .attr('stroke', 'rgba(88,166,255,0.7)').attr('stroke-width', 1.5)
  g.append('circle').attr('cx', c.x).attr('cy', c.y).attr('r', 9).attr('class', 'frustum-center')
    .attr('fill', '#58a6ff').attr('stroke', '#fff').attr('stroke-width', 2).style('cursor', 'grab')
  g.append('text').attr('x', c.x + 13).attr('y', c.y - 10).attr('class', 'axis-text')
    .style('fill', '#9cc7ff').text(`yaw ${state.view.yaw.toFixed(0)}° / pitch ${state.view.pitch.toFixed(0)}°`)
}

onMounted(() => { drawGrid(); drawAxisLabels(); drawFrustum() })
watch(() => [state.view.yaw, state.view.pitch, state.view.fov], drawFrustum)
watch(() => state.currentPointId, drawFrustum)

/* ---------- 交互 ---------- */
const dragState = { mode: null, data: null, moved: false, sx: 0, sy: 0 }

function onDown(e) {
  cancelFlight()
  const p = lonLatFromEvent(e)
  hoverCoord.value = p
  // 点在视锥中心附近 -> 拖动视角
  const c = xy(state.view.yaw, state.view.pitch)
  if (Math.hypot(p.x - c.x, p.y - c.y) < 16) { dragState.mode = 'view'; return }
  dragState.mode = state.tool === 'pan' ? 'view' : 'pending'
  dragState.sx = p.x; dragState.sy = p.y; dragState.moved = false
}
function startDragObj(e, m) {
  cancelFlight()
  dragState.mode = 'obj'; dragState.data = m; dragState.moved = false
}
function onMove(e) {
  const p = lonLatFromEvent(e)
  hoverCoord.value = p
  if (!dragState.mode) return
  if (Math.hypot(p.x - dragState.sx, p.y - dragState.sy) > 3) dragState.moved = true
  if (dragState.mode === 'obj') {
    dragState.data.data.lon = p.lon
    dragState.data.data.lat = p.lat
  } else if (dragState.mode === 'view') {
    setView(p.lon, p.lat)
  }
}
function onUp(e) {
  if (!dragState.mode) { hoverCoord.value = null; return }
  if (dragState.mode === 'pending' && !dragState.moved) {
    const p = lonLatFromEvent(e)
    if (state.tool === 'hotspot') addHotspot(state.currentPointId, p.lon, p.lat)
    else if (state.tool === 'annotation') addAnnotation(state.currentPointId, p.lon, p.lat)
    else if (state.tool === 'comment') {
      const text = window.prompt('给现场留一句话:')
      if (text) addComment(state.currentPointId, p.lon, p.lat, text)
    }
  }
  dragState.mode = null
  hoverCoord.value = null
}
</script>

<style scoped>
.eq-map { display: flex; flex-direction: column; background: #0d1420; border: 1px solid #223044; border-radius: 10px; overflow: hidden; }
.eq-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; font-size: 13px; color: #c9d4e0; background: #131c2b; }
.eq-tip { font-size: 11px; color: #7f93ab; }
.eq-svg { width: 100%; height: auto; display: block; cursor: crosshair; }
:deep(.axis-text) { fill: #8fb3e6; font-size: 16px; pointer-events: none; }
:deep(.map-marker) { cursor: grab; }
:deep(.map-marker.selected .mm-label) { fill: #ffd166; }
.mm-icon { fill: #fff; font-size: 11px; font-weight: 700; text-anchor: middle; pointer-events: none; }
.mm-label { fill: #fff; font-size: 14px; font-weight: 600; paint-order: stroke; stroke: rgba(0,0,0,0.75); stroke-width: 3px; pointer-events: none; }
.eq-coord { position: absolute; }
</style>
