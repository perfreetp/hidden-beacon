import { hashStr, mulberry32, fbm } from './rng.js';
import { SPECIES, SPECIES_BY_ID } from './species.js';

export const ASPECTS = ['平', '南', '东南', '东', '东北', '北', '西北', '西', '西南'];
export const WATERS = ['无', '北侧', '南侧', '东侧', '西侧', '中央贯穿'];

export const DEFAULT_PARAMS = {
  length: 60,          // 地块长(米)
  width: 40,           // 地块宽(米)
  aspect: '南',        // 坡向
  water: '北侧',       // 水系位置
  waterWidth: 4,       // 水系带宽(米)
  density: 0.55,       // 群落密度 0..1
  bloomSpring: 0.8,    // 花期搭配权重
  bloomSummer: 1.0,
  bloomAutumn: 0.6,
  rockRatio: 0.04      // 裸石比例 0..1
};

// 参数规范化序列化,保证同参数 => 同键 => 同结果
export function canonicalParams(p) {
  return [
    +p.length, +p.width, p.aspect, p.water, +p.waterWidth,
    +p.density, +p.bloomSpring, +p.bloomSummer, +p.bloomAutumn, +p.rockRatio
  ].join('|');
}

const ASPECT_DIR = {
  '南': [0, -1], '东南': [0.707, -0.707], '东': [1, 0], '东北': [0.707, 0.707],
  '北': [0, 1], '西北': [-0.707, 0.707], '西': [-1, 0], '西南': [-0.707, -0.707], '平': [0, 0]
};

// 水系:返回到水带的距离(米),水带内为 0
export function waterDistance(x, y, p) {
  const hw = p.waterWidth / 2;
  switch (p.water) {
    case '无': return 1e9;
    case '北侧': return Math.max(0, y - hw);
    case '南侧': return Math.max(0, (p.width - y) - hw);
    case '东侧': return Math.max(0, (p.length - x) - hw);
    case '西侧': return Math.max(0, x - hw);
    case '中央贯穿': return Math.max(0, Math.abs(y - p.width / 2) - hw);
    default: return 1e9;
  }
}

export function moistureAt(x, y, p, seedNum) {
  const d = waterDistance(x, y, p);
  const near = Math.max(0, 1 - d / 18);              // 距水 18m 内逐渐变干
  const n = fbm(x * 0.06, y * 0.06, seedNum + 7, 2); // 微地形扰动
  return Math.min(1, Math.max(0, 0.25 + 0.65 * near + (n - 0.5) * 0.3));
}

export function sunAt(x, y, p) {
  const dir = ASPECT_DIR[p.aspect] || [0, 0];
  if (dir[0] === 0 && dir[1] === 0) return 0.65;
  const cx = p.length / 2;
  const cy = p.width / 2;
  const nx = (x - cx) / (p.length / 2);
  const ny = (y - cy) / (p.width / 2);
  const g = nx * dir[0] + ny * dir[1]; // 沿坡向的梯度
  return Math.min(1, Math.max(0, 0.65 + 0.3 * g));
}

function pickSpecies(rng, layer, bloomW, moisture, sun) {
  const cands = SPECIES.filter((s) => s.layer === layer);
  const weights = cands.map((sp) => {
    let w = 0.15;
    if (sp.bloom[0]) w += bloomW[0];
    if (sp.bloom[1]) w += bloomW[1];
    if (sp.bloom[2]) w += bloomW[2];
    w *= 1 - Math.min(0.8, Math.abs(sp.moisture - moisture));
    w *= 1 - Math.min(0.6, Math.abs(sp.sun - sun) * 0.8);
    return Math.max(0.02, w);
  });
  let total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i];
    if (r <= 0) return cands[i];
  }
  return cands[cands.length - 1];
}

function overlaps(x, y, r, placed, gap) {
  for (const q of placed) {
    const dx = x - q.x;
    const dy = y - q.y;
    const rr = (r + q.r) * gap;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

function inRocks(x, y, rocks, pad = 0) {
  for (const rk of rocks) {
    const c = Math.cos(-rk.rot);
    const s = Math.sin(-rk.rot);
    const lx = (x - rk.x) * c - (y - rk.y) * s;
    const ly = (x - rk.x) * s + (y - rk.y) * c;
    const nx = lx / (rk.rx + pad);
    const ny = ly / (rk.ry + pad);
    if (nx * nx + ny * ny < 1) return true;
  }
  return false;
}

function generateRocks(rng, p, seedNum) {
  const rocks = [];
  const area = p.length * p.width;
  const target = area * p.rockRatio;
  if (target <= 0) return rocks;
  const count = Math.max(1, Math.round(2 + rng() * 3));
  let placed = 0;
  let acc = 0;
  let guard = 0;
  while (acc < target && guard++ < 60) {
    const x = p.length * (0.08 + 0.84 * rng());
    const y = p.width * (0.08 + 0.84 * rng());
    if (waterDistance(x, y, p) < 2) continue;
    const n = fbm(x * 0.15, y * 0.15, seedNum + 31, 2);
    const rx = 1.2 + rng() * 2.6 + n * 1.5;
    const ry = rx * (0.55 + rng() * 0.5);
    const rot = rng() * Math.PI;
    const rk = { x, y, rx, ry, rot, seed: seedNum + placed * 17 };
    if (inRocks(x, y, rocks, Math.max(rx, ry))) continue;
    rocks.push(rk);
    acc += Math.PI * rx * ry;
    placed++;
  }
  return rocks;
}

const LAYER_CFG = {
  tree:  { base: 11, jitter: 0.75, gap: 0.85, accept: 0.9 },
  shrub: { base: 4.2, jitter: 0.8,  gap: 0.8,  accept: 0.85 },
  herb:  { base: 1.5, jitter: 0.85, gap: 0.7,  accept: 0.8 }
};

// 全过程式生成:同 seed+params 结果完全一致
export function generate(params, seed) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const key = String(seed) + '::' + canonicalParams(p);
  const seedNum = hashStr(key);
  const rng = mulberry32(seedNum);
  const bloomW = [+p.bloomSpring, +p.bloomSummer, +p.bloomAutumn];

  const rocks = generateRocks(rng, p, seedNum);
  const plants = [];
  const placedAll = []; // 已占位(高层影响低层)
  let idx = 0;

  for (const layer of ['tree', 'shrub', 'herb']) {
    const cfg = LAYER_CFG[layer];
    const spacing = cfg.base * (1.25 - p.density * 0.75);
    const nx = Math.ceil(p.length / spacing);
    const ny = Math.ceil(p.width / spacing);
    for (let gy = 0; gy < ny; gy++) {
      for (let gx = 0; gx < nx; gx++) {
        const jx = (rng() - 0.5) * spacing * cfg.jitter * 2;
        const jy = (rng() - 0.5) * spacing * cfg.jitter * 2;
        const x = (gx + 0.5) * spacing + jx;
        const y = (gy + 0.5) * spacing + jy;
        const margin = layer === 'tree' ? 2.5 : layer === 'shrub' ? 1.2 : 0.4;
        if (x < margin || y < margin || x > p.length - margin || y > p.width - margin) continue;
        if (waterDistance(x, y, p) < (layer === 'tree' ? 1.5 : 0.3)) continue;
        if (inRocks(x, y, rocks, layer === 'herb' ? -0.3 : 0.4)) continue;

        const moist = moistureAt(x, y, p, seedNum);
        const sun = sunAt(x, y, p);
        const sp = pickSpecies(rng, layer, bloomW, moist, sun);
        const r = sp.canopy * (0.85 + rng() * 0.3);
        if (overlaps(x, y, r, placedAll, cfg.gap)) continue;
        if (rng() > cfg.accept * (0.55 + p.density * 0.6)) continue;

        const h = sp.hMin + rng() * (sp.hMax - sp.hMin);
        const plant = {
          id: 'g' + idx++,
          sp: sp.id,
          x: +x.toFixed(3),
          y: +y.toFixed(3),
          r: +r.toFixed(3),
          h: +h.toFixed(2),
          locked: false
        };
        plants.push(plant);
        placedAll.push(plant);
      }
    }
  }
  return { plants, rocks, params: p, seed: String(seed) };
}

// 重新生成:锁定的植株保持原位,其余按种子重排,与锁定重叠的新植株被剔除
export function regenerate(params, seed, lockedPlants) {
  const fresh = generate(params, seed);
  const kept = lockedPlants.map((pl) => ({ ...pl, locked: true }));
  const filtered = fresh.plants.filter(
    (pl) => !overlaps(pl.x, pl.y, pl.r, kept, 0.7)
  );
  return { ...fresh, plants: [...kept, ...filtered] };
}

// 手工补种/替换时确定性地取样株高与冠幅
export function samplePlantSize(spId, salt) {
  const sp = SPECIES_BY_ID[spId];
  const rng = mulberry32(hashStr(spId + '::' + salt));
  return {
    h: +(sp.hMin + rng() * (sp.hMax - sp.hMin)).toFixed(2),
    r: +(sp.canopy * (0.85 + rng() * 0.3)).toFixed(3)
  };
}
