<template>
  <section>
    <h2>速度曲线</h2>

    <h3>整体速度档位</h3>
    <div class="gears">
      <button v-for="g in 5" :key="g"
              :class="['gear', { active: store.speed.gear === g }]"
              @click="store.speed.gear = g">
        {{ g }} 档
      </button>
    </div>
    <p class="hint">基础速度 {{ base.toFixed(1) }} m/s</p>

    <h3>关键帧速度倍率（3 个）</h3>
    <div v-for="(k, i) in store.speed.keyframes" :key="i" class="kf">
      <div class="kf-row">
        <span class="klabel">关键帧 {{ i + 1 }} · 位置</span>
        <input type="range" min="0.05" max="0.95" step="0.01" v-model.number="k.pos" />
        <span class="kval">{{ (k.pos * 100).toFixed(0) }}%</span>
      </div>
      <div class="kf-row">
        <span class="klabel">速度倍率</span>
        <input type="range" min="0.2" max="3" step="0.1" v-model.number="k.mult" />
        <span class="kval">×{{ k.mult.toFixed(1) }}</span>
      </div>
    </div>

    <h3>行程速度预览（0 ~ 100%）</h3>
    <canvas ref="cv" class="curve" width="640" height="320"></canvas>

    <div class="stats" v-if="stats">
      <div>速度范围：{{ stats.min.toFixed(2) }} ~ {{ stats.max.toFixed(2) }} m/s</div>
      <div>路径全长：{{ stats.total.toFixed(1) }} m</div>
      <div>预计全程：{{ stats.duration.toFixed(1) }} s</div>
    </div>
    <p class="hint" v-else>放置至少 2 个控制点后显示行程统计。</p>
  </section>
</template>

<script setup>
import { ref, computed, watchEffect } from 'vue'
import { store, getSpline } from '../store'
import { speedAt, baseSpeed, estimateDuration } from '../spline'

const cv = ref(null)
const base = computed(() => baseSpeed(store.speed.gear))

const stats = computed(() => {
  const s = getSpline()
  if (!s || s.segCount === 0) return null
  let min = Infinity, max = 0
  for (let i = 0; i <= 100; i++) {
    const v = speedAt(i / 100, store.speed)
    min = Math.min(min, v); max = Math.max(max, v)
  }
  return { min, max, total: s.total, duration: estimateDuration(s.total, store.speed) }
})

watchEffect(() => {
  const canvas = cv.value
  if (!canvas) return
  // 依赖收集
  const cfg = JSON.stringify(store.speed)
  void cfg
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  const padL = 60, padR = 20, padT = 24, padB = 44
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#1a2129'
  ctx.fillRect(0, 0, W, H)

  // 采样
  const N = 200
  const vs = []
  let vmax = 0.1
  for (let i = 0; i <= N; i++) {
    const v = speedAt(i / N, store.speed)
    vs.push(v); if (v > vmax) vmax = v
  }
  vmax *= 1.15

  const x = p => padL + p * (W - padL - padR)
  const y = v => H - padB - (v / vmax) * (H - padT - padB)

  // 网格与坐标
  ctx.strokeStyle = '#33404d'
  ctx.fillStyle = '#9fb0c0'
  ctx.font = '20px sans-serif'
  ctx.lineWidth = 1
  for (let g = 0; g <= 4; g++) {
    const v = (vmax / 4) * g
    ctx.beginPath(); ctx.moveTo(x(0), y(v)); ctx.lineTo(x(1), y(v)); ctx.stroke()
    ctx.fillText(v.toFixed(1), 8, y(v) + 7)
  }
  for (let g = 0; g <= 10; g++) {
    const p = g / 10
    ctx.beginPath(); ctx.moveTo(x(p), y(0)); ctx.lineTo(x(p), y(vmax)); ctx.stroke()
    ctx.fillText((p * 100).toFixed(0) + '%', x(p) - 16, H - 16)
  }

  // 曲线
  ctx.strokeStyle = '#7ee8fa'
  ctx.lineWidth = 3
  ctx.beginPath()
  vs.forEach((v, i) => {
    const px = x(i / N), py = y(v)
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  })
  ctx.stroke()

  // 关键帧标记
  for (const k of store.speed.keyframes) {
    const v = speedAt(k.pos, store.speed)
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.arc(x(k.pos), y(v), 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffd166'
    ctx.fillText('×' + k.mult.toFixed(1), x(k.pos) - 18, y(v) - 14)
  }
})
</script>

<style scoped>
.gears { display: flex; gap: 6px; }
.gear { flex: 1; }
.gear.active { background: #2ec4b6; border-color: #2ec4b6; color: #08201d; font-weight: 600; }
.kf { border: 1px solid #3a4550; border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; }
.kf-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 12px; }
.klabel { min-width: 96px; color: #9fb0c0; }
.kf-row input[type='range'] { flex: 1; }
.kval { min-width: 44px; color: #ffd166; text-align: right; }
.curve { width: 100%; border-radius: 8px; border: 1px solid #3a4550; }
.stats { margin-top: 10px; font-size: 13px; color: #9fb0c0; display: flex; flex-direction: column; gap: 4px; }
</style>
