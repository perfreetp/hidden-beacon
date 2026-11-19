<template>
  <div class="app">
    <header>
      <h1>古建修缮漫游运镜工具</h1>
      <nav>
        <button v-for="t in tabs" :key="t.key"
                :class="{ active: store.tab === t.key }"
                @click="store.tab = t.key">{{ t.label }}</button>
      </nav>
      <div class="io">
        <span class="save">{{ store.saveState }}</span>
        <span class="err" v-if="store.importError">{{ store.importError }}</span>
        <button @click="exportJSON">导出 roam.json</button>
        <label class="import-btn">
          导入 JSON
          <input type="file" accept=".json,application/json" hidden @change="onImport" />
        </label>
      </div>
    </header>
    <main>
      <Viewport />
      <aside>
        <PathEditor v-if="store.tab === 'path'" />
        <TargetEditor v-else-if="store.tab === 'target'" />
        <SpeedCurve v-else-if="store.tab === 'speed'" />
        <RoamPanel v-else />
      </aside>
    </main>
  </div>
</template>

<script setup>
import { store, exportJSON, importJSONFile } from './store'
import Viewport from './components/Viewport.vue'
import PathEditor from './components/PathEditor.vue'
import TargetEditor from './components/TargetEditor.vue'
import SpeedCurve from './components/SpeedCurve.vue'
import RoamPanel from './components/RoamPanel.vue'

const tabs = [
  { key: 'path', label: '路径编辑' },
  { key: 'target', label: '朝向目标' },
  { key: 'speed', label: '速度曲线' },
  { key: 'roam', label: '漫游' }
]

async function onImport(e) {
  const file = e.target.files && e.target.files[0]
  if (file) await importJSONFile(file)
  e.target.value = ''
}
</script>

<style scoped>
.app { display: flex; flex-direction: column; height: 100vh; }
header {
  display: flex; align-items: center; gap: 18px; padding: 0 16px;
  height: 52px; background: #161c23; border-bottom: 1px solid #2b3542; flex: none;
}
h1 { font-size: 16px; color: #e8eef4; white-space: nowrap; }
nav { display: flex; gap: 4px; }
nav button { border-radius: 6px; }
nav button.active { background: #2ec4b6; border-color: #2ec4b6; color: #08201d; font-weight: 600; }
.io { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.save { font-size: 12px; color: #6b7a89; }
.err { font-size: 12px; color: #ef476f; }
.import-btn {
  padding: 6px 12px; font-size: 13px; border: 1px solid #3a4550; border-radius: 6px;
  background: #232c36; color: #cfd8e0; cursor: pointer;
}
.import-btn:hover { border-color: #2ec4b6; }
main { flex: 1; display: flex; min-height: 0; }
aside {
  width: 360px; flex: none; overflow-y: auto; padding: 14px 16px;
  background: #1a2129; border-left: 1px solid #2b3542;
}
</style>
