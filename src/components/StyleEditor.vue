<script setup>
import { style, LAYERS } from '../core/style'
</script>

<template>
  <div class="style-editor">
    <h3>样式表</h3>
    <table>
      <thead>
        <tr>
          <th>图层</th>
          <th>颜色</th>
          <th>线宽/透明度</th>
          <th>虚实</th>
          <th>最小级别</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="l in LAYERS" :key="l.key">
          <td>{{ l.name }}</td>
          <td><input type="color" v-model="style[l.key].color" /></td>
          <td>
            <input
              v-if="l.type === 'line'"
              type="number"
              min="0.5"
              step="0.5"
              v-model.number="style[l.key].width"
            />
            <input
              v-else
              type="number"
              min="0"
              max="1"
              step="0.05"
              v-model.number="style[l.key].opacity"
            />
          </td>
          <td>
            <input
              v-if="l.type === 'line'"
              type="text"
              v-model="style[l.key].dash"
              placeholder="实线"
              title="虚线模式,如 7 5;留空为实线"
            />
            <span v-else class="na">—</span>
          </td>
          <td>
            <input type="number" min="6" max="11" v-model.number="style[l.key].minZoom" />
          </td>
        </tr>
      </tbody>
    </table>

    <h3>标注</h3>
    <table>
      <thead>
        <tr>
          <th>图层</th>
          <th>优先级</th>
          <th>字号</th>
          <th>颜色</th>
          <th>可降级圆点</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="l in LAYERS" :key="l.key">
          <tr v-if="style[l.key].label">
            <td>{{ l.name }}</td>
            <td>
              <input type="number" min="1" max="9" v-model.number="style[l.key].label.priority" />
            </td>
            <td>
              <input type="number" min="8" max="24" v-model.number="style[l.key].label.size" />
            </td>
            <td><input type="color" v-model="style[l.key].label.color" /></td>
            <td><input type="checkbox" v-model="style[l.key].label.allowDot" /></td>
          </tr>
        </template>
      </tbody>
    </table>
    <p class="hint">改动即时生效,地图立即重绘。优先级数字越小越先摆放。</p>
  </div>
</template>

<style scoped>
.style-editor {
  font-size: 13px;
  color: #333;
}
h3 {
  margin: 14px 0 6px;
  font-size: 13px;
  color: #556;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 4px 4px;
  text-align: left;
  border-bottom: 1px solid #e4e6df;
}
th {
  font-weight: 600;
  color: #667;
  font-size: 12px;
}
input[type='number'] {
  width: 52px;
}
input[type='text'] {
  width: 56px;
}
input[type='color'] {
  width: 34px;
  height: 22px;
  padding: 0;
  border: none;
  background: none;
}
.na {
  color: #aab;
}
.hint {
  color: #889;
  font-size: 12px;
  margin-top: 10px;
}
</style>
