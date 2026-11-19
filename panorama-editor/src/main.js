import { createApp } from 'vue'
import App from './App.vue'
import { loadDemo } from './store/editor.js'
import * as editorStore from './store/editor.js'
import * as geoLib from './lib/geo.js'

// 无头测试/外部调试: 暴露同一模块实例 (避免动态 import 产生副本)
if (typeof window !== 'undefined') {
  window.__editor = editorStore
  window.__geo = geoLib
}

// 无头测试/快速体验: ?demo=1 自动生成两个演示点位
const params = new URLSearchParams(location.search)

// 启动错误捕获: 写入固定 DOM 节点, 便于无头环境读取
window.__bootErrors = []
window.addEventListener('error', e => window.__bootErrors.push(String(e.message || e.error)))
window.addEventListener('unhandledrejection', e => window.__bootErrors.push('rejection: ' + String(e.reason)))

const app = createApp(App)
app.config.errorHandler = (err) => window.__bootErrors.push('vue: ' + (err?.stack || err))
app.mount('#app')

if (params.get('demo') === '1') {
  loadDemo().catch(err => window.__bootErrors.push('demo: ' + (err?.stack || err)))
}
