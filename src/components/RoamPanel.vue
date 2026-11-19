<template>
  <section>
    <h2>漫游</h2>

    <p v-if="!ready" class="warn">漫游需要至少 6 个控制点（当前 {{ store.path.points.length }} 个），请先在「路径编辑」页拾取。</p>

    <div class="row btns">
      <button class="primary" :disabled="!ready" @click="togglePlay">
        {{ store.playback.playing ? '⏸ 暂停' : '▶ 播放' }}
      </button>
      <button :disabled="!ready" @click="stop">■ 停止</button>
    </div>

    <div class="row">
      <input type="range" class="seek" min="0" max="1000" :value="seekVal"
             :disabled="!ready" @input="seek" />
      <span class="pct">{{ (progress * 100).toFixed(1) }}%</span>
    </div>

    <div class="info" v-if="ready">
      <div>当前段：<b>第 {{ hud.seg + 1 }} / {{ hud.segCount }} 段</b></div>
      <div>剩余行程：<b>{{ hud.remain.toFixed(1) }} m</b>（{{ hud.remainPct.toFixed(0) }}%）</div>
      <div>路径模式：{{ store.path.closed ? '闭合循环' : '开放（播放到终点停止）' }}</div>
    </div>

    <h3>相机衔接过渡</h3>
    <div class="row">
      <input type="range" min="0.3" max="1.5" step="0.1" v-model.number="store.transition" />
      <span class="pct">{{ store.transition.toFixed(1) }} s</span>
    </div>
    <p class="hint">过渡时间 0.3 ~ 1.5 秒，控制相机经过控制点时前后两段朝向融合的快慢。</p>

    <div class="row">
      <select v-model.number="store.preview.joint" :disabled="joints.length === 0">
        <option v-for="j in joints" :key="j" :value="j">衔接点：控制点 #{{ j + 1 }}</option>
      </select>
      <button :disabled="joints.length === 0" @click="togglePreview">
        {{ store.preview.active ? '停止预览' : '预览衔接' }}
      </button>
    </div>
    <p class="hint" v-if="store.preview.active">红线 = 前一段朝向，绿线 = 后一段朝向，相机在两者之间按过渡时间往复融合。</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { store, getSpline } from '../store'

const ready = computed(() => store.path.points.length >= 6)
const hud = computed(() => store.playback.hud)

const progress = computed(() => {
  const s = getSpline()
  if (!s || s.total === 0) return 0
  return Math.min(1, store.playback.distance / s.total)
})

const seekVal = computed(() => Math.round(progress.value * 1000))

function seek(e) {
  const s = getSpline()
  if (!s) return
  store.playback.distance = (+e.target.value / 1000) * s.total
}

function togglePlay() {
  store.playback.playing = !store.playback.playing
}

function stop() {
  store.playback.playing = false
  store.playback.distance = 0
  store.preview.active = false
}

// 可预览的衔接点（控制点索引）：开放路径为内部点，闭合路径为全部点
const joints = computed(() => {
  const n = store.path.points.length
  if (n < 2) return []
  if (store.path.closed) return Array.from({ length: n }, (_, i) => i)
  return Array.from({ length: n - 2 }, (_, i) => i + 1)
})

function togglePreview() {
  if (store.preview.active) {
    store.preview.active = false
  } else {
    if (!joints.value.includes(store.preview.joint)) store.preview.joint = joints.value[0]
    store.preview.active = true
  }
}
</script>

<style scoped>
.warn { color: #ffb703; font-size: 13px; }
.btns { display: flex; gap: 8px; }
.primary { background: #2ec4b6; border-color: #2ec4b6; color: #08201d; font-weight: 600; }
.seek { flex: 1; }
.pct { min-width: 52px; text-align: right; color: #7ee8fa; font-size: 13px; }
.info {
  margin: 10px 0; padding: 8px 10px; border-radius: 6px;
  background: rgba(255, 255, 255, 0.05); font-size: 13px;
  display: flex; flex-direction: column; gap: 4px; color: #9fb0c0;
}
.info b { color: #e8eef4; }
select { flex: 1; }
</style>
