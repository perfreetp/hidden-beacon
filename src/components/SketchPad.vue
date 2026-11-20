<template>
  <div class="sketch-wrap">
    <canvas
      ref="canvasRef"
      class="sketch-canvas"
      :width="SIZE"
      :height="SIZE"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    ></canvas>

    <!-- 尺寸标注:双击数字改数值 -->
    <div
      v-if="closed && bbPx && editingDim !== 'w'"
      class="dim-chip dim-w"
      :style="widthChipStyle"
      title="双击修改宽度"
      @dblclick="startEdit('w')"
    >
      宽 {{ dimW }}
    </div>
    <div
      v-if="closed && bbPx && editingDim !== 'h'"
      class="dim-chip dim-h"
      :style="heightChipStyle"
      title="双击修改高度"
      @dblclick="startEdit('h')"
    >
      高 {{ dimH }}
    </div>
    <input
      v-if="editingDim"
      ref="dimInput"
      v-model="editValue"
      class="dim-input"
      :class="editingDim === 'w' ? 'dim-w' : 'dim-h'"
      :style="editingDim === 'w' ? widthChipStyle : heightChipStyle"
      type="number"
      min="0.5"
      max="20"
      step="0.5"
      @keydown.enter="commitEdit"
      @keydown.esc="editingDim = null"
      @blur="commitEdit"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { store } from '../store';
import {
  snapGrid,
  dist,
  applyCorners,
  ensureCCW,
  bbox,
  scalePointsTo,
  simplifyCollinear,
} from '../geometry';

const SIZE = 520; // 画布边长(px)
const UNIT = 24; // 1 网格单位 = 24px
const cx = SIZE / 2;
const cy = SIZE / 2;

const canvasRef = ref(null);
const dimInput = ref(null);
let ctx = null;
let raf = 0;

const stroke = ref([]); // 当前一笔的已提交点
const constraints = ref([]); // 每段的约束标记 'H' | 'V' | null
const drawing = ref(false);
const gap = ref(false); // 画完但未闭合
const snapCursor = ref(null); // 吸附预览点
const axisDrag = ref(false);

const editingDim = ref(null); // 'w' | 'h' | null
const editValue = ref('');

const closed = computed(() => store.draft.closed);

const bbPx = computed(() => {
  if (!closed.value || store.draft.points.length < 3) return null;
  const b = bbox(store.draft.points);
  return {
    left: cx + b.minX * UNIT,
    right: cx + b.maxX * UNIT,
    top: cy - b.maxY * UNIT,
    bottom: cy - b.minY * UNIT,
    w: b.w,
    h: b.h,
  };
});
const dimW = computed(() => (bbPx.value ? bbPx.value.w.toFixed(1) : ''));
const dimH = computed(() => (bbPx.value ? bbPx.value.h.toFixed(1) : ''));
const widthChipStyle = computed(() =>
  bbPx.value
    ? { left: (bbPx.value.left + bbPx.value.right) / 2 + 'px', top: bbPx.value.bottom + 24 + 'px' }
    : {}
);
const heightChipStyle = computed(() =>
  bbPx.value
    ? { left: bbPx.value.left - 24 + 'px', top: (bbPx.value.top + bbPx.value.bottom) / 2 + 'px' }
    : {}
);

// ---------- 尺寸编辑 ----------
function startEdit(dim) {
  editingDim.value = dim;
  editValue.value = dim === 'w' ? dimW.value : dimH.value;
  nextTick(() => {
    dimInput.value?.focus();
    dimInput.value?.select();
  });
}

function commitEdit() {
  const v = parseFloat(editValue.value);
  if (Number.isFinite(v) && v >= 0.5 && v <= 20 && editingDim.value) {
    store.draft.points = scalePointsTo(store.draft.points, editingDim.value, v);
  }
  editingDim.value = null;
}

// ---------- 坐标换算 ----------
function getPos(e) {
  const r = canvasRef.value.getBoundingClientRect();
  return {
    x: (e.clientX - r.left - cx) / UNIT,
    y: (cy - (e.clientY - r.top)) / UNIT,
  };
}

// 吸附:优先吸到本笔起点,其次吸附网格
function snapFor(p) {
  if (stroke.value.length && dist(p, stroke.value[0]) < 0.7) {
    return { ...stroke.value[0] };
  }
  return snapGrid(p);
}

// ---------- 绘制交互 ----------
function onDown(e) {
  if (e.button !== 0) return;
  canvasRef.value.setPointerCapture(e.pointerId);
  const p = getPos(e);

  if (closed.value) {
    // 已闭合:只允许拖动旋转轴
    if (store.draft.revolve && Math.abs(p.x - store.draft.axisX) < 0.5) {
      axisDrag.value = true;
    }
    return;
  }

  if (gap.value) {
    // 缺口模式:点击任一端点圆点 → 自动补上缺口
    const f = stroke.value[0];
    const l = stroke.value[stroke.value.length - 1];
    if (dist(p, f) < 0.9 || dist(p, l) < 0.9) {
      finish(stroke.value.slice());
    }
    return;
  }

  drawing.value = true;
  stroke.value = [snapFor(p)];
  constraints.value = [];
}

function onMove(e) {
  const p = getPos(e);
  if (axisDrag.value) {
    store.draft.axisX = Math.round(p.x * 2) / 2;
    return;
  }
  if (!drawing.value) {
    snapCursor.value = null;
    return;
  }
  const c = snapFor(p);
  snapCursor.value = c;
  const last = stroke.value[stroke.value.length - 1];
  if (dist(c, last) < 0.45) return;

  // 接近水平/垂直 → 自动加约束并吸附
  let con = null;
  const dx = c.x - last.x;
  const dy = c.y - last.y;
  if (Math.abs(dy) <= 0.27 * Math.abs(dx)) {
    c.y = last.y;
    con = 'H';
  } else if (Math.abs(dx) <= 0.27 * Math.abs(dy)) {
    c.x = last.x;
    con = 'V';
  }
  if (dist(c, last) < 0.3) return;
  stroke.value.push(c);
  constraints.value.push(con);
}

function onUp() {
  axisDrag.value = false;
  if (!drawing.value) return;
  drawing.value = false;
  snapCursor.value = null;
  const s = stroke.value;
  if (s.length >= 3 && dist(s[0], s[s.length - 1]) <= 0.8) {
    // 首尾相接 → 闭合
    finish(s.slice(0, -1));
  } else if (s.length >= 2) {
    gap.value = true; // 未闭合 → 标出缺口
  } else {
    stroke.value = [];
    constraints.value = [];
  }
}

function finish(pts) {
  const clean = simplifyCollinear(pts);
  if (clean.length < 3) {
    stroke.value = [];
    constraints.value = [];
    gap.value = false;
    return;
  }
  store.draft.points = clean;
  store.draft.closed = true;
  gap.value = false;
  stroke.value = [];
  constraints.value = [];
  // 旋转轴默认放到轮廓左侧
  const b = bbox(clean);
  store.draft.axisX = Math.floor(b.minX) - 1.5;
}

// 外部「重新画」→ 清空本地笔画状态
watch(closed, (v) => {
  if (!v) {
    stroke.value = [];
    constraints.value = [];
    gap.value = false;
    drawing.value = false;
    editingDim.value = null;
  }
});

// ---------- 画布渲染 ----------
function drawLine(a, b, color, width, dash) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash || []);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

const toPx = (p) => ({ x: cx + p.x * UNIT, y: cy - p.y * UNIT });

function draw(t) {
  ctx.clearRect(0, 0, SIZE, SIZE);

  // 网格
  for (let k = -22; k <= 22; k++) {
    const x = cx + k * UNIT * 0.5;
    const y = cy + k * UNIT * 0.5;
    const major = k % 2 === 0;
    drawLine({ x, y: 0 }, { x, y: SIZE }, major ? '#d5dcea' : '#e9edf5', major ? 1.2 : 1);
    drawLine({ x: 0, y }, { x: SIZE, y }, major ? '#d5dcea' : '#e9edf5', major ? 1.2 : 1);
  }
  // 中心十字
  drawLine({ x: cx, y: 0 }, { x: cx, y: SIZE }, '#c3cce0', 1.6);
  drawLine({ x: 0, y: cy }, { x: SIZE, y: cy }, '#c3cce0', 1.6);

  // 旋转轴(回转体模式)
  if (store.draft.revolve && closed.value) {
    const ax = cx + store.draft.axisX * UNIT;
    drawLine({ x: ax, y: 0 }, { x: ax, y: SIZE }, '#e05563', 2.5, [10, 7]);
    ctx.fillStyle = '#e05563';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('旋转轴(可拖动)', Math.min(ax + 8, SIZE - 110), 20);
  }

  if (closed.value && store.draft.points.length >= 3) {
    const pts = store.draft.points.map(toPx);
    // 填充
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(79, 195, 247, 0.20)';
    ctx.fill();
    ctx.strokeStyle = '#1e88e5';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 倒角/圆角后的实际轮廓预览
    if (store.draft.cornerMode !== 'none') {
      const shaped = applyCorners(
        ensureCCW(store.draft.points),
        store.draft.cornerMode,
        store.draft.cornerRadius
      ).map(toPx);
      ctx.beginPath();
      ctx.moveTo(shaped[0].x, shaped[0].y);
      for (let i = 1; i < shaped.length; i++) ctx.lineTo(shaped[i].x, shaped[i].y);
      ctx.closePath();
      ctx.strokeStyle = '#43a047';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 顶点
    ctx.fillStyle = '#1e88e5';
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 尺寸参考线
    if (bbPx.value) {
      const b = bbPx.value;
      const g = '#90a4ae';
      drawLine({ x: b.left, y: b.bottom + 24 }, { x: b.right, y: b.bottom + 24 }, g, 1.5);
      drawLine({ x: b.left, y: b.bottom + 18 }, { x: b.left, y: b.bottom + 30 }, g, 1.5);
      drawLine({ x: b.right, y: b.bottom + 18 }, { x: b.right, y: b.bottom + 30 }, g, 1.5);
      drawLine({ x: b.left - 24, y: b.top }, { x: b.left - 24, y: b.bottom }, g, 1.5);
      drawLine({ x: b.left - 30, y: b.top }, { x: b.left - 18, y: b.top }, g, 1.5);
      drawLine({ x: b.left - 30, y: b.bottom }, { x: b.left - 18, y: b.bottom }, g, 1.5);
    }
  } else if (stroke.value.length) {
    // 绘制中的一笔
    const pts = stroke.value.map(toPx);
    ctx.strokeStyle = '#1e88e5';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // 端点小圆点
    ctx.fillStyle = '#1e88e5';
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 水平/垂直约束标记
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < constraints.value.length; i++) {
      const c = constraints.value[i];
      if (!c) continue;
      const a = pts[i];
      const b = pts[i + 1];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.beginPath();
      ctx.arc(mx, my - 10, 8, 0, Math.PI * 2);
      ctx.fillStyle = c === 'H' ? '#ff9800' : '#26a69a';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(c, mx, my - 10);
    }

    // 缺口提示:两个可补端点 + 虚线
    if (gap.value) {
      const f = pts[0];
      const l = pts[pts.length - 1];
      drawLine(f, l, '#ff7043', 2, [6, 6]);
      const r = 7 + 2 * Math.sin(t / 180);
      for (const p of [f, l]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ff7043';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
    }
  }

  // 吸附预览
  if (drawing.value && snapCursor.value) {
    const p = toPx(snapCursor.value);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  raf = requestAnimationFrame(draw);
}

onMounted(() => {
  const canvas = canvasRef.value;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  raf = requestAnimationFrame(draw);
});

onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<style scoped>
.sketch-wrap {
  position: relative;
  width: 520px;
  flex: none;
}

.sketch-canvas {
  width: 520px;
  height: 520px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 18px rgba(60, 80, 140, 0.12);
  cursor: crosshair;
  touch-action: none;
  display: block;
}

.dim-chip,
.dim-input {
  position: absolute;
  z-index: 2;
  font-size: 14px;
  font-weight: 700;
  color: #1565c0;
  background: #e3f2fd;
  border: 2px solid #90caf9;
  border-radius: 999px;
  padding: 3px 12px;
  white-space: nowrap;
}

.dim-chip {
  cursor: pointer;
}

.dim-chip:hover {
  background: #bbdefb;
}

.dim-w {
  transform: translate(-50%, 0);
}

.dim-h {
  transform: translate(-100%, -50%);
}

.dim-input {
  width: 92px;
  outline: none;
  font-family: inherit;
  text-align: center;
}
</style>
