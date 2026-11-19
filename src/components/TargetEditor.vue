<template>
  <section>
    <h2>朝向目标</h2>
    <p class="hint">为每个控制点绑定场景中的观察目标；权重 1~5 决定该目标注视影响的强弱；「跟随」实时追踪目标（含移动目标），「固定」锁定绑定瞬间的坐标。</p>

    <h3>场景目标</h3>
    <div class="targets">
      <div v-for="t in TARGET_DEFS" :key="t.id" class="target"
           @mouseenter="store.highlightTargetId = t.id"
           @mouseleave="store.highlightTargetId = null">
        <span class="dot" :style="{ background: t.color }"></span>
        <span class="tname">{{ t.name }}</span>
        <button class="mini" @click="focus(t.id)">定位</button>
      </div>
    </div>

    <h3>控制点绑定</h3>
    <div class="binds">
      <div v-for="(p, i) in store.path.points" :key="p.id" class="bind">
        <div class="bind-head">
          <span class="idx">点 #{{ i + 1 }}</span>
          <select :value="bindingOf(p.id)?.targetId || ''" @change="setTarget(p.id, $event.target.value)">
            <option value="">（无 · 沿切线方向）</option>
            <option v-for="t in TARGET_DEFS" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <template v-if="bindingOf(p.id)">
          <div class="bind-row">
            <span>注视权重</span>
            <input type="range" min="1" max="5" step="1"
                   :value="bindingOf(p.id).weight"
                   @input="setWeight(p.id, +$event.target.value)" />
            <span class="wval">{{ bindingOf(p.id).weight }} 档</span>
          </div>
          <div class="bind-row">
            <label><input type="radio" :name="'mode-' + p.id" value="follow"
                   :checked="bindingOf(p.id).mode === 'follow'"
                   @change="setMode(p.id, 'follow')" /> 目标跟随</label>
            <label><input type="radio" :name="'mode-' + p.id" value="fixed"
                   :checked="bindingOf(p.id).mode === 'fixed'"
                   @change="setMode(p.id, 'fixed')" /> 目标固定</label>
          </div>
        </template>
      </div>
      <p v-if="store.path.points.length === 0" class="empty">请先在「路径编辑」页放置控制点。</p>
    </div>
  </section>
</template>

<script setup>
import { store, liveTargetPos, targetDef } from '../store'
import { TARGET_DEFS } from '../targets'

function bindingOf(pid) {
  return store.bindings[pid]
}

function setTarget(pid, targetId) {
  if (!targetId) {
    delete store.bindings[pid]
  } else {
    store.bindings[pid] = { targetId, weight: 3, mode: 'follow' }
  }
}

function setWeight(pid, w) {
  const b = store.bindings[pid]
  if (b) b.weight = Math.min(5, Math.max(1, w))
}

function setMode(pid, mode) {
  const b = store.bindings[pid]
  if (!b) return
  b.mode = mode
  if (mode === 'fixed') {
    // 快照当前目标坐标
    const live = liveTargetPos[b.targetId]
    const def = targetDef(b.targetId)
    b.fixedPosition = live ? [...live] : (def ? [...def.pos] : [0, 0, 0])
  } else {
    delete b.fixedPosition
  }
}

function focus(id) {
  store.focusReq.id = id
  store.focusReq.n++
}
</script>

<style scoped>
.targets { display: flex; flex-direction: column; gap: 4px; }
.target {
  display: flex; align-items: center; gap: 8px; padding: 4px 6px;
  border-radius: 6px; background: rgba(255, 255, 255, 0.04); font-size: 13px;
}
.dot { width: 10px; height: 10px; border-radius: 50%; }
.tname { flex: 1; }
.mini { font-size: 11px; padding: 2px 8px; }
.binds { display: flex; flex-direction: column; gap: 8px; max-height: 46vh; overflow-y: auto; }
.bind { border: 1px solid #3a4550; border-radius: 6px; padding: 6px 8px; }
.bind-head { display: flex; align-items: center; gap: 8px; }
.bind-head select { flex: 1; }
.bind-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px; color: #9fb0c0; }
.bind-row input[type='range'] { flex: 1; }
.wval { min-width: 36px; color: #ffd166; }
.idx { color: #7ee8fa; }
.empty { color: #6b7a89; font-size: 12px; }
</style>
