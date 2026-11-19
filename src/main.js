import { createApp } from 'vue'
import App from './App.vue'
import { initStore } from './store'
import './style.css'

initStore().finally(() => {
  createApp(App).mount('#app')
})
