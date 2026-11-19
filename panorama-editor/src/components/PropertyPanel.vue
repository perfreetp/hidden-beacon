<template>
  <div class="panel">
    <div class="panel-title">对象属性</div>
    <p v-if="!sel" class="empty">在画面或展开图中选中热点 / 设备标注 / 留言进行编辑</p>
    <template v-else-if="sel.kind === 'hotspot'">
      <label class="field">名称<input v-model="sel.data.label" /></label>
      <div class="field-row">
        <label>经度<input :value="sel.data.lon.toFixed(2)" readonly /></label>
        <label>纬度<input :value="sel.data.lat.toFixed(2)" readonly /></label>
      </div>
      <label class="field">颜色<input type="color" v-model="sel.data.color" /></label>
      <label class="field">跳转到点位
        <select v-model="sel.data.targetPointId">
          <option :value="null">不跳转 (仅朝向)</option>
          <option v-for="id in state.pointOrder.filter(i => i !== state.currentPointId)" :key="id" :value="id">
            {{ state.points[id].name }}
          </option>
        </select>
      </label>
      <div class="btn-row">
        <button class="btn small" @click="flyTo(sel.data.lon, sel.data.lat)">飞到此处</button>
        <button class="btn small danger" @click="removeSelected">删除</button>
      </div>
    </template>
    <template v-else-if="sel.kind === 'annotation'">
      <label class="field">设备名称<input v-model="sel.data.title" /></label>
      <div class="field-row">
        <label>经度<input :value="sel.data.lon.toFixed(2)" readonly /></label>
        <label>纬度<input :value="sel.data.lat.toFixed(2)" readonly /></label>
      </div>
      <label class="field">朝向角 (相对正北)
        <input type="range" min="-180" max="180" step="1" v-model.number="sel.data.heading" />
        <em>{{ sel.data.heading.toFixed(0) }}°</em>
      </label>
      <label class="field">巡检备注<textarea rows="3" v-model="sel.data.note"></textarea></label>
      <div class="btn-row">
        <button class="btn small" @click="sel.data.heading = state.view.yaw">取当前朝向</button>
        <button class="btn small danger" @click="removeSelected">删除</button>
      </div>
    </template>
    <template v-else>
      <label class="field">留言人<input v-model="sel.data.author" /></label>
      <label class="field">内容<textarea rows="3" v-model="sel.data.text"></textarea></label>
      <div class="field-row">
        <label>经度<input :value="sel.data.lon.toFixed(2)" readonly /></label>
        <label>纬度<input :value="sel.data.lat.toFixed(2)" readonly /></label>
      </div>
      <div class="btn-row"><button class="btn small danger" @click="removeSelected">删除</button></div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { state, currentPoint, removeSelected, flyTo } from '../store/editor.js'

const sel = computed(() => {
  const p = currentPoint.value
  if (!p || !state.selected.kind) return null
  const key = state.selected.kind === 'hotspot' ? 'hotspots'
    : state.selected.kind === 'annotation' ? 'annotations' : 'comments'
  const data = p[key].find(x => x.id === state.selected.id)
  return data ? { kind: state.selected.kind, data } : null
})
</script>

<style scoped>
.panel { background: #131c2b; border: 1px solid #223044; border-radius: 10px; padding: 12px; }
.panel-title { font-size: 13px; font-weight: 700; color: #e6edf3; margin-bottom: 8px; }
.empty { font-size: 12px; color: #7f93ab; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #9fb0c3; margin-bottom: 10px; position: relative; }
.field em { position: absolute; right: 0; top: 0; color: #58a6ff; font-style: normal; }
.field input, .field select, .field textarea { background: #0f1620; border: 1px solid #334155; color: #e6edf3; border-radius: 6px; padding: 6px 8px; font-size: 12px; font-family: inherit; }
.field input[readonly] { color: #7f93ab; }
.field input[type="range"] { padding: 0; margin-top: 4px; }
.field-row { display: flex; gap: 8px; margin-bottom: 10px; }
.field-row label { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #9fb0c3; }
.btn-row { display: flex; gap: 8px; }
.btn.small { padding: 4px 10px; font-size: 12px; }
.btn.danger { background: #3a1d24; border-color: #7a2e3c; color: #ff8f9c; }
</style>
