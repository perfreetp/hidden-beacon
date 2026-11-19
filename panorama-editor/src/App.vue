<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">🚰 供水泵站 · 全景漫游编辑器</div>
      <div class="tools">
        <button v-for="t in toolDefs" :key="t.id" class="tool-btn" :class="{ on: state.tool === t.id }"
                @click="state.tool = t.id" :title="t.tip">{{ t.icon }} {{ t.name }}</button>
      </div>
      <div class="top-actions">
        <button class="btn" @click="loadDemo">载入演示数据</button>
        <label class="btn file-btn">导入漫游包
          <input type="file" accept="application/json" hidden @change="onImport" />
        </label>
        <button class="btn primary" @click="downloadPackage()">导出漫游包</button>
      </div>
    </header>

    <main class="layout">
      <aside class="left-col">
        <PointPanel />
        <CompassPanel />
      </aside>

      <section class="center-col">
        <PanoView />
      </section>

      <aside class="right-col">
        <PropertyPanel />
        <EquirectMap />
        <ConnectionGraph />
      </aside>
    </main>
  </div>
</template>

<script setup>
import { state, loadDemo, importPackage, downloadPackage } from './store/editor.js'
import PanoView from './components/PanoView.vue'
import EquirectMap from './components/EquirectMap.vue'
import PointPanel from './components/PointPanel.vue'
import CompassPanel from './components/CompassPanel.vue'
import PropertyPanel from './components/PropertyPanel.vue'
import ConnectionGraph from './components/ConnectionGraph.vue'

const toolDefs = [
  { id: 'pan', name: '环视', icon: '🧭', tip: '拖动环视 / 方向键微调' },
  { id: 'hotspot', name: '热点', icon: '📍', tip: '单击放置跳转热点' },
  { id: 'annotation', name: '设备标注', icon: '🏷️', tip: '单击放置带朝向的设备标注' },
  { id: 'comment', name: '留言', icon: '💬', tip: '单击给同事留一句话' }
]

async function onImport(e) {
  const file = e.target.files[0]
  if (!file) return
  try {
    await importPackage(await file.text())
    alert('漫游包导入成功')
  } catch (err) {
    alert('导入失败: ' + err.message)
  }
  e.target.value = ''
}
</script>

<style>
@import './styles.css';
</style>
