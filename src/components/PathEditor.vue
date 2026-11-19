<template>
  <section>
    <h2>路径编辑</h2>
    <p class="hint">在左侧模型上点击以拾取控制点（至少 6 个），拖拽控制点可调整位置，Alt+拖拽调整高度。</p>

    <div class="row">
      <span :class="['count', enough ? 'ok' : 'warn']">
        已放置 {{ pts.length }} 个控制点<template v-if="!enough">（还需 {{ 6 - pts.length }} 个）</template>
      </span>
    </div>

    <label class="row check">
      <input type="checkbox" v-model="store.path.closed" />
      闭合路径（首尾相连循环漫游）
    </label>

    <div class="row btns">
      <button @click="store.selectedPointId = null" :disabled="!store.selectedPointId">取消选中</button>
      <button class="danger" @click="clearPath" :disabled="pts.length === 0">清空路径</button>
    </div>

    <h3>控制点</h3>
    <div class="plist">
      <div v-for="(p, i) in pts" :key="p.id"
           :class="['pt', { sel: p.id === store.selectedPointId }]"
           @click="store.selectedPointId = p.id">
        <span class="idx">#{{ i + 1 }}</span>
        <label>X<input type="number" step="0.1" v-model.number="p.position[0]" @click.stop /></label>
        <label>Y<input type="number" step="0.1" v-model.number="p.position[1]" @click.stop /></label>
        <label>Z<input type="number" step="0.1" v-model.number="p.position[2]" @click.stop /></label>
        <button class="del" title="删除该点" @click.stop="removePoint(p.id)">×</button>
      </div>
      <p v-if="pts.length === 0" class="empty">暂无控制点，请在模型上点击拾取。</p>
    </div>

    <h3>分段切线方向</h3>
    <div class="seglist">
      <div v-for="s in segments" :key="s.i" class="seg">
        <span class="idx">段 {{ s.i + 1 }}</span>
        <span class="tan">切线 ({{ s.dir[0] }}, {{ s.dir[1] }}, {{ s.dir[2] }})</span>
        <span class="len">{{ s.len.toFixed(1) }} m</span>
      </div>
      <p v-if="segments.length === 0" class="empty">至少需要 2 个控制点才能构成路径段。</p>
    </div>
    <p class="hint" v-if="splineInfo">全长 {{ splineInfo.total.toFixed(1) }} m · 共 {{ splineInfo.segCount }} 段 · {{ store.path.closed ? '闭合' : '开放' }}路径</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { store, getSpline, removePoint, clearPath } from '../store'
import { norm3 } from '../spline'

const pts = computed(() => store.path.points)
const enough = computed(() => pts.value.length >= 6)

const splineInfo = computed(() => {
  const s = getSpline()
  return s && s.segCount > 0 ? { total: s.total, segCount: s.segCount } : null
})

const segments = computed(() => {
  const s = getSpline()
  if (!s || s.segCount === 0) return []
  const out = []
  for (let i = 0; i < s.segCount; i++) {
    const d = norm3(s.tangentAt(i, 0.5)).map(v => v.toFixed(2))
    out.push({ i, dir: d, len: s.table[i].len })
  }
  return out
})
</script>

<style scoped>
.count.ok { color: #06d6a0; }
.count.warn { color: #ffb703; }
.check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.btns { display: flex; gap: 8px; }
.plist { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
.pt {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px;
  border: 1px solid #3a4550; border-radius: 6px; cursor: pointer; font-size: 12px;
}
.pt.sel { border-color: #2ec4b6; background: rgba(46, 196, 182, 0.12); }
.pt label { display: flex; align-items: center; gap: 2px; color: #9fb0c0; }
.pt input { width: 52px; }
.idx { color: #7ee8fa; min-width: 28px; }
.del { margin-left: auto; background: none; border: none; color: #ef476f; font-size: 16px; cursor: pointer; }
.seglist { display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; }
.seg {
  display: flex; gap: 8px; align-items: center; font-size: 12px;
  padding: 3px 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.04);
}
.tan { color: #ffd166; font-family: monospace; }
.len { margin-left: auto; color: #9fb0c0; }
.empty { color: #6b7a89; font-size: 12px; }
</style>
