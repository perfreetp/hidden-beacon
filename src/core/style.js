import { reactive } from 'vue'

// 图层渲染顺序:先画的在底层
export const LAYERS = [
  { key: 'hillshade', name: '山体阴影', type: 'fill' },
  { key: 'water', name: '水系', type: 'line' },
  { key: 'roads', name: '公路', type: 'line' },
  { key: 'trails', name: '步道', type: 'line' },
]

// 样式表:按要素类型配置颜色 / 线宽 / 虚实 / 最小可见级别 / 标注规则。
// 该对象为响应式,样式编辑器修改后渲染层立即重绘。
export const style = reactive({
  hillshade: {
    color: '#a49480',
    opacity: 0.45,
    minZoom: 6,
  },
  water: {
    color: '#4a90d9',
    width: 2,
    dash: '',
    opacity: 1,
    minZoom: 6,
    label: { priority: 3, size: 11, color: '#2f6db3', allowDot: false },
  },
  roads: {
    color: '#e07b39',
    width: 3,
    dash: '',
    opacity: 1,
    minZoom: 6,
    label: { priority: 2, size: 12, color: '#a8541f', allowDot: true },
  },
  trails: {
    color: '#c0392b',
    width: 2.2,
    dash: '7 5',
    opacity: 1,
    minZoom: 6,
    label: { priority: 1, size: 12, color: '#8e2f23', allowDot: true },
  },
})
