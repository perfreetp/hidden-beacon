<template>
  <div class="panel">
    <div class="panel-title">视角与过渡</div>
    <div class="compass-row">
      <svg viewBox="-60 -60 120 120" class="compass" @mousedown="compassDown" @mousemove="compassMove" @mouseup="compassUp" @mouseleave="compassUp">
        <circle r="52" class="dial"></circle>
        <g :transform="`rotate(${-state.view.yaw})`">
          <g v-for="t in ticks" :key="t.deg" :transform="`rotate(${t.deg})`">
            <line y1="-46" y2="-40" :stroke="t.major ? '#c9d4e0' : '#5a6b80'" :stroke-width="t.major ? 2 : 1"></line>
            <text v-if="t.label" y="-30" text-anchor="middle" class="dir-label"
                  :class="{ north: t.label === 'N' }">{{ t.label }}</text>
          </g>
          <polygon points="0,-22 -7,8 0,2 7,8" fill="#e63946"></polygon>
        </g>
        <circle r="4" fill="#e6edf3"></circle>
      </svg>
      <div class="compass-readout">
        <div><b>朝向</b> {{ norm(state.view.yaw).toFixed(1) }}°</div>
        <div><b>俯仰</b> {{ state.view.pitch.toFixed(1) }}°</div>
        <button class="btn small" @click="state.view.yaw = 0">回正北</button>
      </div>
    </div>

    <label class="slider-row">
      <span>视野 FOV <em>{{ state.view.fov.toFixed(0) }}°</em></span>
      <input type="range" min="20" max="110" step="1" v-model.number="state.view.fov" />
    </label>
    <label class="slider-row">
      <span>俯仰角 <em>{{ state.view.pitch.toFixed(0) }}°</em></span>
      <input type="range" min="-85" max="85" step="1" v-model.number="state.view.pitch" />
    </label>
    <div class="divider"></div>
    <label class="slider-row">
      <span>过渡时长 <em>{{ state.transition.duration }} ms</em></span>
      <input type="range" min="200" max="4000" step="100" v-model.number="state.transition.duration" />
    </label>
    <label class="slider-row">
      <span>额外旋转 <em>{{ state.transition.extraSpins }} 圈</em></span>
      <input type="range" min="0" max="2" step="1" v-model.number="state.transition.extraSpins" />
    </label>
    <div v-if="state.transition.active" class="flight-progress">
      <div :style="{ width: (state.transition.progress * 100).toFixed(0) + '%' }"></div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { state, setView, wrapLon } from '../store/editor.js'

const ticks = Array.from({ length: 24 }, (_, i) => {
  const deg = i * 15
  return { deg, major: deg % 90 === 0, label: deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : '' }
})
const norm = wrapLon
let dragging = false

function angleFromEvent(e) {
  const svg = e.currentTarget
  const rect = svg.getBoundingClientRect()
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
  // 屏幕 y 向下, 角度取负
  return wrapLon(Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180 / Math.PI)
}
function compassDown(e) { dragging = true; setView(angleFromEvent(e), state.view.pitch) }
function compassMove(e) { if (dragging) setView(angleFromEvent(e), state.view.pitch) }
function compassUp() { dragging = false }
</script>

<style scoped>
.panel { background: #131c2b; border: 1px solid #223044; border-radius: 10px; padding: 12px; }
.panel-title { font-size: 13px; font-weight: 700; color: #e6edf3; margin-bottom: 10px; letter-spacing: 0.5px; }
.compass-row { display: flex; gap: 12px; align-items: center; }
.compass { width: 108px; height: 108px; cursor: pointer; flex: none; }
.dial { fill: #0f1620; stroke: #334155; stroke-width: 2; }
:deep(.dir-label) { fill: #c9d4e0; font-size: 12px; font-weight: 700; }
:deep(.dir-label.north) { fill: #e63946; }
.compass-readout { font-size: 12px; color: #9fb0c3; display: flex; flex-direction: column; gap: 4px; }
.compass-readout b { color: #e6edf3; }
.slider-row { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 12px; color: #9fb0c3; }
.slider-row em { float: right; color: #58a6ff; font-style: normal; font-weight: 700; }
.slider-row input { width: 100%; accent-color: #2f81f7; }
.divider { height: 1px; background: #223044; margin: 12px 0 2px; }
.flight-progress { margin-top: 10px; height: 6px; border-radius: 3px; background: #0f1620; overflow: hidden; }
.flight-progress div { height: 100%; background: linear-gradient(90deg, #2f81f7, #58a6ff); transition: width 0.05s linear; }
.btn.small { padding: 3px 10px; font-size: 12px; margin-top: 6px; }
</style>
