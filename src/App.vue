<script setup>
import MapView from './components/MapView.vue'
import StyleEditor from './components/StyleEditor.vue'
import { view, zoomTo, resetView, MINZ, MAXZ } from './core/viewState'
</script>

<template>
  <div class="app">
    <header>
      <span class="title">山地徒步线路制图 · 矢量瓦片渲染器</span>
      <span class="sub">Vue3 + SVG + D3 · 本地瓦片按需加载</span>
    </header>
    <main>
      <MapView />
      <aside>
        <section class="controls">
          <h3>视角</h3>
          <div class="row">
            <label>缩放</label>
            <input
              type="range"
              :min="MINZ - 0.5"
              :max="MAXZ + 1"
              step="0.1"
              :value="view.zoom"
              @input="zoomTo(+$event.target.value)"
            />
            <span>{{ view.zoom.toFixed(1) }}</span>
          </div>
          <div class="row">
            <label>旋转</label>
            <input type="range" min="-180" max="180" step="1" v-model.number="view.rotation" />
            <span>{{ view.rotation }}°</span>
          </div>
          <div class="row">
            <label>倾斜</label>
            <input type="range" min="0" max="60" step="1" v-model.number="view.pitch" />
            <span>{{ view.pitch }}°</span>
          </div>
          <div class="row btns">
            <button @click="zoomTo(view.zoom + 1)">＋</button>
            <button @click="zoomTo(view.zoom - 1)">－</button>
            <button @click="resetView">重置视角</button>
          </div>
          <p class="hint">拖拽平移 · 滚轮缩放 · 双击放大一级 · 悬停查看要素</p>
        </section>
        <StyleEditor />
      </aside>
    </main>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}
html,
body,
#app {
  height: 100%;
  margin: 0;
}
body {
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
header {
  padding: 8px 14px;
  background: #2e3a2f;
  color: #eef0e6;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
header .title {
  font-weight: 600;
}
header .sub {
  font-size: 12px;
  opacity: 0.7;
}
main {
  flex: 1;
  display: flex;
  min-height: 0;
}
aside {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid #d8dcd0;
  background: #f7f8f3;
  padding: 4px 14px 14px;
  overflow-y: auto;
}
.controls h3 {
  margin: 12px 0 6px;
  font-size: 13px;
  color: #556;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  font-size: 13px;
}
.row label {
  width: 34px;
  color: #556;
}
.row input[type='range'] {
  flex: 1;
}
.row span {
  width: 40px;
  text-align: right;
  color: #667;
  font-variant-numeric: tabular-nums;
}
.btns button {
  margin-right: 6px;
  padding: 4px 12px;
  border: 1px solid #c4cabb;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
}
.btns button:hover {
  background: #eef0e6;
}
.hint {
  color: #889;
  font-size: 12px;
}
</style>
