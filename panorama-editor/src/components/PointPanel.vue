<template>
  <div class="panel">
    <div class="panel-title">
      勘察点位
      <button class="btn small" @click="addPoint(`点位 ${state.pointOrder.length + 1}`)">+ 新建</button>
    </div>
    <div class="point-list">
      <div v-for="id in state.pointOrder" :key="id"
           class="point-item" :class="{ active: id === state.currentPointId }"
           @click="switchPoint(id)">
        <span class="dot" :style="{ background: faceReady(id) ? '#2ecc71' : '#e67e22' }"></span>
        <span class="pname">{{ state.points[id].name }}</span>
        <span class="pcount">{{ state.points[id].hotspots.length }} 热点</span>
        <button class="link danger" title="删除" @click.stop="removePoint(id)">删</button>
      </div>
      <p v-if="!state.pointOrder.length" class="empty">暂无点位, 可先载入演示数据</p>
    </div>

    <template v-if="point">
      <div class="divider"></div>
      <input class="text-input" v-model="point.name" placeholder="点位名称" />
      <div class="cube-grid">
        <div v-for="f in faces" :key="f.id" class="face-cell">
          <img v-if="point.faces[f.id]" :src="point.faces[f.id]" />
          <div v-else class="face-empty">{{ f.label.split(' ')[0] }}</div>
          <label class="face-mask">
            <input type="file" accept="image/*" @change="onPick($event, f.id)" hidden />
            <span>{{ f.label }}</span>
          </label>
        </div>
      </div>
      <div class="face-actions">
        <label class="check"><input type="checkbox" v-model="state.settings.seamAlign" /> 接缝颜色对齐</label>
        <button class="btn small" :disabled="!allFaces || building" @click="rebuild">
          {{ building ? '拼接中…' : '重新拼接等距柱状图' }}
        </button>
      </div>
      <p v-if="gainsText" class="gains-text">{{ gainsText }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  state, currentPoint, addPoint, switchPoint, removePoint,
  setFaceFile, rebuildEquirect
} from '../store/editor.js'
import { CUBE_FACES } from '../lib/geo.js'

const faces = CUBE_FACES
const point = currentPoint
const building = ref(false)

const allFaces = computed(() => point.value && faces.every(f => point.value.faces[f.id]))
function faceReady(id) { return faces.every(f => state.points[id]?.faces[f.id]) }

const gainsText = computed(() => {
  const g = point.value?.gains
  if (!g) return ''
  return '各面色彩增益: ' + faces.map(f => `${f.id} ${g[f.id].r.toFixed(2)}`).join(' / ')
})

async function onPick(e, faceId) {
  const file = e.target.files[0]
  if (!file || !point.value) return
  building.value = true
  try { await setFaceFile(point.value.id, faceId, file) }
  finally { building.value = false; e.target.value = '' }
}
async function rebuild() {
  building.value = true
  try { await rebuildEquirect(point.value.id) } finally { building.value = false }
}
</script>

<style scoped>
.panel { background: #131c2b; border: 1px solid #223044; border-radius: 10px; padding: 12px; }
.panel-title { font-size: 13px; font-weight: 700; color: #e6edf3; display: flex; justify-content: space-between; align-items: center; }
.point-list { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; }
.point-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; font-size: 12px; color: #c9d4e0; cursor: pointer; }
.point-item:hover { background: #1b2738; }
.point-item.active { background: #1f3252; color: #fff; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.pname { flex: 1; }
.pcount { color: #7f93ab; font-size: 11px; }
.link { background: none; border: 0; color: #58a6ff; cursor: pointer; font-size: 12px; }
.link.danger { color: #e66; }
.empty { font-size: 12px; color: #7f93ab; padding: 8px 0; }
.divider { height: 1px; background: #223044; margin: 12px 0; }
.text-input { width: 100%; box-sizing: border-box; background: #0f1620; border: 1px solid #334155; color: #e6edf3; border-radius: 6px; padding: 7px 9px; font-size: 12px; margin-bottom: 10px; }
.cube-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.face-cell { position: relative; aspect-ratio: 1; border-radius: 6px; overflow: hidden; border: 1px solid #2a3a52; background: #0f1620; }
.face-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.face-empty { width: 100%; height: 100%; display: grid; place-items: center; color: #46586f; font-size: 18px; font-weight: 700; }
.face-mask { position: absolute; inset: 0; display: grid; place-items: end center; cursor: pointer; background: linear-gradient(transparent 55%, rgba(8,12,18,0.85)); }
.face-mask span { color: #cfe0f5; font-size: 10px; padding-bottom: 4px; }
.face-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; gap: 8px; flex-wrap: wrap; }
.check { font-size: 12px; color: #9fb0c3; display: flex; align-items: center; gap: 5px; }
.gains-text { font-size: 10px; color: #7f93ab; margin-top: 8px; word-break: break-all; line-height: 1.6; }
.btn.small { padding: 4px 10px; font-size: 12px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
