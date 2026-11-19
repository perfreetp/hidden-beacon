// 程序化生成演示用六面立方体贴图 (泵站现场风格), 每面带轻微色差,
// 用来验证接缝颜色对齐的效果。
import { CUBE_FACES } from './geo.js'

const SIZE = 512

function faceCanvas(faceId, variant, tint) {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const g = c.getContext('2d')
  const tints = { px: [1.06, 0.97, 0.94], nx: [0.95, 1.03, 1.05], py: [1.0, 1.0, 1.0],
                  ny: [0.92, 0.92, 0.95], pz: [1.04, 1.0, 0.96], nz: [0.97, 0.98, 1.04] }
  const t = tints[faceId]

  // 墙面/地面底色
  const grad = g.createLinearGradient(0, 0, 0, SIZE)
  if (faceId === 'py') { grad.addColorStop(0, '#d8dde2'); grad.addColorStop(1, '#b9c0c8') }
  else if (faceId === 'ny') { grad.addColorStop(0, '#8a8f96'); grad.addColorStop(1, '#6f747b') }
  else { grad.addColorStop(0, '#cfd6dc'); grad.addColorStop(1, '#aeb7bf') }
  g.fillStyle = grad
  g.fillRect(0, 0, SIZE, SIZE)

  // 瓷砖/板缝网格 (贴在所有竖直面, 棱边处网格宽度一致以体现连续感)
  if (faceId !== 'py' && faceId !== 'ny') {
    g.strokeStyle = 'rgba(70,80,90,0.35)'; g.lineWidth = 2
    for (let i = 1; i < 4; i++) {
      g.beginPath(); g.moveTo((SIZE / 4) * i, 0); g.lineTo((SIZE / 4) * i, SIZE); g.stroke()
      g.beginPath(); g.moveTo(0, (SIZE / 4) * i); g.lineTo(SIZE, (SIZE / 4) * i); g.stroke()
    }
  } else {
    g.strokeStyle = 'rgba(70,80,90,0.3)'; g.lineWidth = 2
    for (let i = 1; i < 8; i++) {
      g.beginPath(); g.moveTo((SIZE / 8) * i, 0); g.lineTo((SIZE / 8) * i, SIZE); g.stroke()
      g.beginPath(); g.moveTo(0, (SIZE / 8) * i); g.lineTo(SIZE, (SIZE / 8) * i); g.stroke()
    }
  }

  // 横管: 蓝绿色供水管沿墙上部走
  pipe(g, 0, 120, SIZE, 150, '#3f8f8b', '#2c6b68')
  pipe(g, 0, 168, SIZE, 190, '#9aa4ad', '#717b84')

  if (faceId === 'pz') {
    // 北面: 主水泵机组 / 阀门
    pumpUnit(g, SIZE * 0.5, SIZE * 0.62, variant)
    label(g, SIZE / 2, 60, variant === 1 ? '北侧 · 1# 水泵机组' : '北侧 · 总进水阀', '#1d3557')
    northMark(g, 70, 70)
  } else if (faceId === 'nz') {
    pumpUnit(g, SIZE * 0.5, SIZE * 0.62, variant === 1 ? 2 : 1)
    label(g, SIZE / 2, 60, variant === 1 ? '南侧 · 2# 水泵机组' : '南侧 · 排水泵', '#1d3557')
  } else if (faceId === 'px') {
    cabinet(g, SIZE * 0.5, SIZE * 0.55)
    label(g, SIZE / 2, 60, '东侧 · 配电柜', '#7a3b16')
  } else if (faceId === 'nx') {
    meterWall(g)
    label(g, SIZE / 2, 60, '西侧 · 流量计与压力表', '#1d3557')
  } else if (faceId === 'py') {
    label(g, SIZE / 2, SIZE / 2, '顶棚 · 照明与通风管', '#444')
    lamp(g, SIZE * 0.3, SIZE * 0.3); lamp(g, SIZE * 0.7, SIZE * 0.7)
  } else {
    label(g, SIZE / 2, SIZE * 0.18, '地面 · 排水沟与基座', '#eee')
    drain(g)
  }

  // 每面整体色调微调 (模拟不同曝光), 交给接缝对齐修正
  const img = g.getImageData(0, 0, SIZE, SIZE)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp255(d[i] * t[0] * tint)
    d[i + 1] = clamp255(d[i + 1] * t[1] * tint)
    d[i + 2] = clamp255(d[i + 2] * t[2] * tint)
  }
  g.putImageData(img, 0, 0)
  return c
}

function clamp255(v) { return Math.max(0, Math.min(255, v)) }

function pipe(g, x1, y1, x2, y2, c1, c2) {
  const h = y2 - y1
  const grad = g.createLinearGradient(0, y1, 0, y2)
  grad.addColorStop(0, c1); grad.addColorStop(0.5, c2); grad.addColorStop(1, '#20403f')
  g.fillStyle = grad
  g.fillRect(x1, y1, x2 - x1, h)
  g.fillStyle = 'rgba(255,255,255,0.25)'
  g.fillRect(x1, y1 + 3, x2 - x1, 4)
}

function pumpUnit(g, cx, cy, variant) {
  const color = variant === 1 ? '#2f6fb0' : '#b0562f'
  // 基座
  g.fillStyle = '#5d666e'; g.fillRect(cx - 130, cy + 70, 260, 26)
  // 电机
  g.fillStyle = '#3c4650'
  roundRect(g, cx - 120, cy - 30, 110, 90, 10); g.fill()
  // 泵体蜗壳
  g.fillStyle = color
  g.beginPath(); g.arc(cx + 40, cy + 15, 62, 0, Math.PI * 2); g.fill()
  g.fillStyle = 'rgba(255,255,255,0.25)'
  g.beginPath(); g.arc(cx + 24, cy, 22, 0, Math.PI * 2); g.fill()
  // 铭牌
  g.fillStyle = '#f4d35e'
  g.fillRect(cx - 105, cy - 18, 54, 26)
  g.fillStyle = '#222'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'
  g.fillText(variant === 1 ? '1#泵' : '2#泵', cx - 78, cy + 1)
}

function cabinet(g, cx, cy) {
  g.fillStyle = '#4a5560'; roundRect(g, cx - 90, cy - 130, 180, 260, 8); g.fill()
  g.fillStyle = '#dfe6ec'; g.fillRect(cx - 78, cy - 118, 156, 200)
  g.fillStyle = '#27ae60'
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(cx - 50 + i * 34, cy - 80, 8, 0, 7); g.fill() }
  g.fillStyle = '#c0392b'
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx - 34 + i * 34, cy - 30, 8, 0, 7); g.fill() }
  g.strokeStyle = '#7f8c8d'; g.lineWidth = 2
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(cx - 60, cy + 10 + i * 26); g.lineTo(cx + 60, cy + 10 + i * 26); g.stroke() }
}

function meterWall(g) {
  for (let i = 0; i < 3; i++) {
    const cx = 110 + i * 145, cy = 250
    g.fillStyle = '#f0f3f6'; g.beginPath(); g.arc(cx, cy, 48, 0, 7); g.fill()
    g.strokeStyle = '#33475b'; g.lineWidth = 4; g.stroke()
    g.strokeStyle = '#c0392b'; g.lineWidth = 3
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 28, cy - 22); g.stroke()
    g.fillStyle = '#33475b'; g.font = '14px sans-serif'; g.textAlign = 'center'
    g.fillText(['流量', '压力', '液位'][i], cx, cy + 78)
  }
}

function northMark(g, x, y) {
  g.fillStyle = '#c1121f'
  g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x - 16, y + 18); g.lineTo(x, y + 8); g.lineTo(x + 16, y + 18); g.closePath(); g.fill()
  g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'
  g.fillText('N', x, y + 2)
}

function lamp(g, x, y) {
  g.fillStyle = '#e9ecef'; g.beginPath(); g.arc(x, y, 26, 0, 7); g.fill()
  g.fillStyle = 'rgba(255,236,170,0.55)'; g.beginPath(); g.arc(x, y, 40, 0, 7); g.fill()
}

function drain(g) {
  g.strokeStyle = '#3c434a'; g.lineWidth = 10
  g.beginPath(); g.moveTo(40, SIZE * 0.5); g.lineTo(SIZE - 40, SIZE * 0.5); g.stroke()
  g.strokeStyle = '#7d868f'; g.lineWidth = 2
  for (let x = 60; x < SIZE - 40; x += 28) {
    g.beginPath(); g.moveTo(x, SIZE * 0.5 - 12); g.lineTo(x, SIZE * 0.5 + 12); g.stroke()
  }
}

function label(g, x, y, text, color) {
  g.font = 'bold 26px sans-serif'; g.textAlign = 'center'
  g.fillStyle = 'rgba(255,255,255,0.8)'
  const w = g.measureText(text).width
  g.fillRect(x - w / 2 - 14, y - 28, w + 28, 40)
  g.fillStyle = color
  g.fillText(text, x, y)
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}

export function buildDemoPoint(variant) {
  const tint = variant === 1 ? 1.0 : 1.04
  const faces = {}
  for (const f of CUBE_FACES) {
    faces[f.id] = faceCanvas(f.id, variant, tint).toDataURL('image/jpeg', 0.9)
  }
  if (variant === 1) {
    return {
      name: '1# 泵房 (主点位)',
      faces,
      hotspots: [
        { id: 'demo_hs_east', lon: 90, lat: 0, label: '前往阀门间 →', targetPointId: null, color: '#ffb020', _demoLink: true },
        { id: 'demo_hs_south', lon: 180, lat: -6, label: '查看 2# 机组', targetPointId: null, color: '#4cc9f0' }
      ],
      annotations: [
        { id: 'demo_an_1', lon: 0, lat: -8, heading: 0, title: '1# 离心水泵', note: '额定流量 320m³/h, 日常巡检听轴承异响' },
        { id: 'demo_an_2', lon: 90, lat: 2, heading: 90, title: '低压配电柜', note: '柜门接地, 操作前挂警示牌' }
      ],
      comments: [
        { id: 'demo_cm_1', lon: -35, lat: -10, text: '地脚螺栓有轻微锈蚀, 下次检修更换。', author: '王工', time: new Date(Date.now() - 86400000).toISOString() },
        { id: 'demo_cm_2', lon: 45, lat: 8, text: '此处管道保温层接缝开胶。', author: '李巡检', time: new Date().toISOString() }
      ]
    }
  }
  return {
    name: '2# 阀门间',
    faces,
    hotspots: [
      { id: 'demo_hs_back', lon: -90, lat: 0, label: '← 返回 1# 泵房', targetPointId: null, color: '#ffb020', _demoLink: true }
    ],
    annotations: [
      { id: 'demo_an_3', lon: 0, lat: -5, heading: 0, title: 'DN300 电动蝶阀', note: '开关限位每季度校验一次' }
    ],
    comments: [
      { id: 'demo_cm_3', lon: 20, lat: 6, text: '阀杆盘根处有滴漏, 已记录工单。', author: '赵班长', time: new Date().toISOString() }
    ]
  }
}
