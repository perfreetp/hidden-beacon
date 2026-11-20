<template>
  <div class="app">
    <header class="topbar">
      <div class="title">🧱 形状搭建乐园</div>
      <div class="top-actions">
        <button class="btn ghost" @click="setView('front')">正视图</button>
        <button class="btn ghost" @click="setView('top')">俯视图</button>
        <button class="btn ghost" @click="setView('orbit')">环绕视角</button>
        <button class="btn primary" @click="exportImage">📷 导出图片</button>
      </div>
    </header>

    <main class="main">
      <section class="left">
        <SketchPad />

        <div class="panel">
          <div class="panel-row">
            <span class="label">造型方式</span>
            <div class="seg">
              <button :class="{ on: !store.draft.revolve }" @click="store.draft.revolve = false">
                拉伸积木
              </button>
              <button :class="{ on: store.draft.revolve }" @click="store.draft.revolve = true">
                旋转积木
              </button>
            </div>
          </div>

          <div v-if="!store.draft.revolve" class="panel-row">
            <span class="label">厚度</span>
            <input
              v-model.number="store.draft.thickness"
              type="range"
              min="0.2"
              max="8"
              step="0.1"
            />
            <span class="val">{{ store.draft.thickness.toFixed(1) }}</span>
          </div>

          <div v-else class="panel-row">
            <span class="label">旋转角度</span>
            <input v-model.number="store.draft.angle" type="range" min="15" max="360" step="15" />
            <span class="val">{{ store.draft.angle }}°</span>
          </div>

          <div class="panel-row">
            <span class="label">尖角处理</span>
            <div class="seg">
              <button
                v-for="m in cornerModes"
                :key="m.key"
                :class="{ on: store.draft.cornerMode === m.key }"
                @click="store.draft.cornerMode = m.key"
              >
                {{ m.name }}
              </button>
            </div>
          </div>

          <div class="panel-row">
            <span class="label">边角半径</span>
            <input
              v-model.number="store.draft.cornerRadius"
              type="range"
              min="0.1"
              max="1.5"
              step="0.05"
              :disabled="store.draft.cornerMode === 'none'"
            />
            <span class="val">{{ store.draft.cornerRadius.toFixed(2) }}</span>
          </div>

          <div class="panel-row btns">
            <button class="btn warn" @click="resetDraft">✏️ 重新画</button>
            <button class="btn primary" :disabled="!store.draft.closed" @click="addCopy">
              📄 复制一份
            </button>
            <button class="btn danger" :disabled="!canDelete" @click="removeSelected">
              🗑️ 删除选中
            </button>
          </div>
        </div>
      </section>

      <section class="right">
        <Viewport3D ref="vp" />
      </section>
    </main>

    <footer class="hintbar">{{ hint }}</footer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import SketchPad from './components/SketchPad.vue';
import Viewport3D from './components/Viewport3D.vue';
import { store, addCopy, removeSelected, resetDraft } from './store';

const vp = ref(null);

const cornerModes = [
  { key: 'none', name: '保持尖角' },
  { key: 'chamfer', name: '倒角' },
  { key: 'fillet', name: '圆角' },
];

const canDelete = computed(
  () => store.selectedId && store.selectedId !== 'draft' &&
    store.blocks.some((b) => b.id === store.selectedId)
);

const hint = computed(() => {
  if (store.hasOverlap) return '⚠️ 有积木穿模啦!拖动红色描边的积木,把它们分开。';
  const d = store.draft;
  if (!d.closed) {
    return '👆 在左边画布上按住拖动,一笔画出封闭轮廓;首尾没接上时,点一下橙色圆点就能补上缺口。';
  }
  if (d.revolve) {
    return '🌀 拖动右边绿色小球或角度滑块,让轮廓绕红色虚线轴旋转成型,角度每 15° 一档。';
  }
  return '💪 拖动右边积木上的黄色小球把它拉厚;双击左边尺寸数字可以改宽和高;点「复制一份」开始拼搭!';
});

function setView(v) {
  vp.value?.setView(v);
}

function exportImage() {
  vp.value?.exportImage();
}
</script>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 58px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(60, 80, 140, 0.1);
  z-index: 5;
}

.title {
  font-size: 21px;
  font-weight: 800;
  color: #1565c0;
}

.top-actions {
  display: flex;
  gap: 10px;
}

.main {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
  padding: 14px;
}

.left {
  width: 548px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding-bottom: 4px;
}

.right {
  flex: 1;
  min-width: 0;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 18px rgba(60, 80, 140, 0.12);
  background: #fff;
}

.panel {
  background: #fff;
  border-radius: 16px;
  padding: 12px 16px;
  box-shadow: 0 4px 18px rgba(60, 80, 140, 0.1);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.label {
  width: 68px;
  flex: none;
  font-size: 14px;
  font-weight: 700;
  color: #546e7a;
}

.val {
  width: 44px;
  flex: none;
  text-align: right;
  font-weight: 700;
  color: #1565c0;
  font-size: 14px;
}

input[type='range'] {
  flex: 1;
  accent-color: #1e88e5;
  height: 26px;
}

.seg {
  display: flex;
  background: #eceff1;
  border-radius: 999px;
  padding: 3px;
  gap: 3px;
}

.seg button {
  border: none;
  background: transparent;
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 14px;
  font-weight: 700;
  color: #607d8b;
  cursor: pointer;
}

.seg button.on {
  background: #1e88e5;
  color: #fff;
}

.btns {
  margin-top: 2px;
}

.btn {
  border: none;
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  background: #eceff1;
  color: #37474f;
  transition: transform 0.06s ease;
}

.btn:active {
  transform: scale(0.96);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary,
.btn-primary {
  background: #1e88e5;
  color: #fff;
}

.btn.warn {
  background: #fff3e0;
  color: #e65100;
}

.btn.danger {
  background: #ffebee;
  color: #c62828;
}

.btn.ghost {
  background: #e3f2fd;
  color: #1565c0;
}

.hintbar {
  flex: none;
  padding: 10px 22px;
  background: #fff8e1;
  border-top: 2px solid #ffecb3;
  font-size: 15px;
  font-weight: 600;
  color: #6d4c00;
}
</style>
