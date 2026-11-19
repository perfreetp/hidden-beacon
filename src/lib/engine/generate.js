// 立面过程式生成器：确定性布局 + 网格 + 带锁重生成
import { mulberry32, hashSeed } from './prng.js';
import { getModel, defaultModel } from './catalog.js';

export const DEFAULT_PARAMS = {
  area: '一号厂区',
  span: 6.5,          // 跨度（开间宽，米）
  floorHeight: 4.5,   // 层高（米）
  bays: 5,            // 开间数
  gap: 1.2,           // 设备间距（米）
  pipeDiameter: 0.6,  // 管径（米）
  seed: 'FLUE-2026-01'
};

export function buildGrid(p) {
  const axes = [];
  for (let b = 0; b <= p.bays; b++) axes.push(+(b * p.span).toFixed(3));
  const totalHeight = deriveHeight(p);
  const floors = [];
  const nf = Math.ceil(totalHeight / p.floorHeight);
  for (let i = 0; i <= nf; i++) floors.push(+(i * p.floorHeight).toFixed(3));
  return { axes, floors, totalHeight: nf * p.floorHeight };
}

function deriveHeight(p) {
  // 总高度由最高的烟囱型号决定，保证监测平台不出屋面
  const stackH = Math.max(...['YC-60', 'YC-80', 'YC-100'].map((m) => getModel('stack', m).h));
  return stackH + 4;
}

const r1 = (rng, min, max) => +(min + rng() * (max - min)).toFixed(2);

// 单开间内主设备类型轮换规则
function mainTypeForBay(b, bays) {
  if (b === bays - 1) return 'stack';
  const cycle = ['desulf', 'baghouse'];
  return cycle[b % 2];
}

export function generate(params, prev = null) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const rng = mulberry32(hashSeed(`${p.seed}|${p.area}|${p.bays}|${p.span}|${p.floorHeight}|${p.gap}|${p.pipeDiameter}`));
  const grid = buildGrid(p);
  const { axes, floors, totalHeight } = grid;
  const mainDuctY = floors[floors.length - 1] - 2.5;
  const rackBaseY = floors[1] ? floors[1] + 0.3 : 0.3;

  const devices = [];
  const mainByBay = new Map();

  // ---- 1. 主设备：脱硫塔 / 布袋除尘器 / 烟囱 ----
  for (let b = 0; b < p.bays; b++) {
    const type = mainTypeForBay(b, p.bays);
    const model = getModel(type, defaultModel(type));
    const left = axes[b] + p.gap;
    const right = axes[b + 1] - p.gap;
    const w = Math.min(model.w, right - left);
    const h = Math.min(model.h, totalHeight - 1);
    // 同种子下位置抖动被限制在开间内
    const jitter = r1(rng, 0, Math.max(0, right - left - w - 0.2));
    const x = +(left + jitter).toFixed(2);
    const d = makeDevice(`D-${type}-b${b}`, type, model.model, x, 0, w, h, b);
    devices.push(d);
    mainByBay.set(b, d);
  }

  // ---- 2. 管廊与爬梯 ----
  for (let b = 0; b < p.bays; b++) {
    const rackModel = getModel('rack', defaultModel('rack'));
    const rw = +(p.span - p.gap * 2).toFixed(2);
    devices.push(makeDevice(
      `D-rack-b${b}`, 'rack', rackModel.model,
      +(axes[b] + p.gap).toFixed(2), rackBaseY, rw, Math.min(rackModel.h, totalHeight - rackBaseY - 1), b
    ));

    const ladModel = getModel('ladder', defaultModel('ladder'));
    const lx = b === p.bays - 1 ? axes[b] + 0.2 : axes[b + 1] - 1.0;
    devices.push(makeDevice(
      `D-ladder-b${b}`, 'ladder', ladModel.model,
      +lx.toFixed(2), 0, ladModel.w, Math.min(ladModel.h, totalHeight - 1), b
    ));
  }

  // ---- 3. 采样探头（每开间 1~2 支，烟囱平台固定 2 支）----
  for (let b = 0; b < p.bays; b++) {
    const main = mainByBay.get(b);
    const nProbe = main.type === 'stack' ? 2 : 1 + Math.floor(rng() * 2);
    for (let k = 0; k < nProbe; k++) {
      const pm = getModel('probe', defaultModel('probe'));
      let ax, ay;
      if (main.type === 'stack') {
        ax = main.x + (k === 0 ? main.w * 0.25 : main.w * 0.75);
        ay = main.y + main.h - 2.5;           // 监测平台高度
      } else {
        ax = main.x + main.w - 0.9 - k * 1.3;
        ay = main.y + main.h + 0.4;
      }
      const px = +(ax - pm.w / 2).toFixed(2);
      const py = +(ay - pm.h).toFixed(2);
      const probe = makeDevice(`D-probe-b${b}-${k}`, 'probe', pm.model, px, py, pm.w, pm.h, b);
      probe.anchorHeight = +ay.toFixed(2);
      devices.push(probe);
    }
  }

  // ---- 4. 与上一版合并：锁住的设备原样保留 ----
  const prevDev = new Map((prev?.devices || []).map((d) => [d.id, d]));
  const freshDevIds = new Set(devices.map((d) => d.id));
  for (const d of devices) {
    const old = prevDev.get(d.id);
    if (old) {
      d.visible = old.visible;
      if (old.locked) Object.assign(d, pickLocked(old));
    }
  }
  for (const old of prevDev.values()) {
    if (old.locked && !freshDevIds.has(old.id)) devices.push({ ...old });
  }
  const devById = new Map(devices.map((d) => [d.id, d]));

  // ---- 5. 管线（基于合并后的设备坐标生成）----
  const pipes = [];
  const ductR = p.pipeDiameter;
  for (let b = 0; b < p.bays; b++) {
    const main = mainByBay.get(b);
    const liveMain = devById.get(main.id) || main;

    // 主设备顶部 → 屋面下主烟管（垂直段）
    pipes.push(makePipe(
      `P-v-${liveMain.type}-b${b}`,
      liveMain.x + liveMain.w / 2, liveMain.y + liveMain.h,
      liveMain.x + liveMain.w / 2, mainDuctY, ductR, b
    ));
    // 屋面下水平主烟管，按开间分段
    pipes.push(makePipe(
      `P-h-main-b${b}`, axes[b], mainDuctY, axes[b + 1], mainDuctY, ductR, b
    ));
    // 管廊层水平支管
    pipes.push(makePipe(
      `P-h-rack-b${b}`, axes[b] + 0.3, rackBaseY + 1.1, axes[b + 1] - 0.3, rackBaseY + 1.1,
      +(ductR * 0.7).toFixed(2), b
    ));
  }
  // 采样探头引线：探头挂点 → 主烟管
  for (const d of devices) {
    if (d.type !== 'probe') continue;
    const ax = +(d.x + d.w / 2).toFixed(2);
    pipes.push(makePipe(
      `P-p-${d.id}`, ax, d.anchorHeight ?? d.y + d.h, ax, mainDuctY, 0.2, d.bay
    ));
  }

  // ---- 6. 管线的带锁合并 ----
  const prevPipe = new Map((prev?.pipes || []).map((x) => [x.id, x]));
  const freshPipeIds = new Set(pipes.map((x) => x.id));
  for (const x of pipes) {
    const old = prevPipe.get(x.id);
    if (old) {
      x.visible = old.visible;
      if (old.locked) Object.assign(x, pickLocked(old));
    }
  }
  for (const old of prevPipe.values()) {
    if (old.locked && !freshPipeIds.has(old.id)) pipes.push({ ...old });
  }

  const bounds = {
    width: axes[axes.length - 1] + 3,
    height: totalHeight + 2
  };
  return {
    params: p,
    grid: { ...grid, mainDuctY: +mainDuctY.toFixed(2), rackBaseY: +rackBaseY.toFixed(2) },
    devices,
    pipes,
    bounds,
    meta: {
      deviceCount: devices.length,
      pipeCount: pipes.length,
      lockedCount: devices.filter((d) => d.locked).length + pipes.filter((x) => x.locked).length
    }
  };
}

function makeDevice(id, type, model, x, y, w, h, bay) {
  return {
    id, kind: 'device', type, model,
    code: id.replace('D-', '').toUpperCase(),
    x: +x, y: +y, w: +w, h: +h, bay,
    locked: false, visible: true,
    anchorHeight: +(y + h).toFixed(2)
  };
}

function makePipe(id, x1, y1, x2, y2, diameter, bay) {
  return {
    id, kind: 'pipe',
    code: id.replace('P-', '').toUpperCase(),
    x1: +x1, y1: +y1, x2: +x2, y2: +y2,
    diameter, bay, locked: false, visible: true
  };
}

function pickLocked(old) {
  if (old.kind === 'pipe') {
    return { x1: old.x1, y1: old.y1, x2: old.x2, y2: old.y2, locked: true, model: old.model };
  }
  return { x: old.x, y: old.y, w: old.w, h: old.h, model: old.model, locked: true, anchorHeight: old.anchorHeight };
}

// ---- 吸附：最近轴线 / 层高线 ----
export function snapElement(el, grid) {
  const nearest = (arr, v) => arr.reduce((best, x) =>
    Math.abs(x - v) < Math.abs(best - v) ? x : best, arr[0]);

  if (el.kind === 'pipe') {
    const mx = (el.x1 + el.x2) / 2;
    const my = (el.y1 + el.y2) / 2;
    const sx = nearest(grid.axes, mx);
    const sy = nearest(grid.floors, my);
    const dx = +(sx - mx).toFixed(3);
    const dy = +(sy - my).toFixed(3);
    return {
      value: {
        ...el,
        x1: +(el.x1 + dx).toFixed(2), x2: +(el.x2 + dx).toFixed(2),
        y1: +(el.y1 + dy).toFixed(2), y2: +(el.y2 + dy).toFixed(2)
      },
      guides: [
        { axis: 'x', pos: sx, active: Math.abs(dx) < 0.8 },
        { axis: 'y', pos: sy, active: Math.abs(dy) < 0.8 }
      ]
    };
  }
  const sx = nearest(grid.axes, el.x);
  const sy = nearest(grid.floors, el.y);
  const floorGap = grid.floors.length > 1 ? grid.floors[1] - grid.floors[0] : 1;
  return {
    value: { ...el, x: +sx.toFixed(2), y: +sy.toFixed(2) },
    guides: [
      { axis: 'x', pos: sx, active: Math.abs(sx - el.x) < p_halfSpan(grid) },
      { axis: 'y', pos: sy, active: Math.abs(sy - el.y) < floorGap }
    ]
  };
}

function p_halfSpan(grid) {
  return grid.axes.length > 1 ? (grid.axes[1] - grid.axes[0]) / 2 : 1;
}

// 拖拽过程中的实时吸附（距离阈值内才吸，阈值外跟手）
export function liveSnap(el, grid, dxWorld, dyWorld) {
  const moved = el.kind === 'pipe'
    ? { ...el, x1: el.x1 + dxWorld, x2: el.x2 + dxWorld, y1: el.y1 + dyWorld, y2: el.y2 + dyWorld }
    : { ...el, x: el.x + dxWorld, y: el.y + dyWorld };
  const r = snapElement(moved, grid);
  const thX = p_halfSpan(grid) * 0.6;
  const thY = (grid.floors[1] - grid.floors[0]) * 0.6;
  if (el.kind === 'pipe') {
    const mx = (moved.x1 + moved.x2) / 2;
    const my = (moved.y1 + moved.y2) / 2;
    r.guides[0].active = Math.abs(r.guides[0].pos - mx) <= thX;
    r.guides[1].active = Math.abs(r.guides[1].pos - my) <= thY;
  } else {
    r.guides[0].active = Math.abs(r.guides[0].pos - moved.x) <= thX;
    r.guides[1].active = Math.abs(r.guides[1].pos - moved.y) <= thY;
  }
  // 未进入吸附阈值的维度保持跟手坐标
  if (!r.guides[0].active) {
    if (el.kind === 'pipe') { r.value.x1 = moved.x1; r.value.x2 = moved.x2; }
    else r.value.x = moved.x;
  }
  if (!r.guides[1].active) {
    if (el.kind === 'pipe') { r.value.y1 = moved.y1; r.value.y2 = moved.y2; }
    else r.value.y = moved.y;
  }
  return r;
}
