import { get } from 'svelte/store';
import { params, seed, scene, pickedPlant, boxSelected } from './store.js';
import { generate, regenerate, samplePlantSize, DEFAULT_PARAMS } from './generate.js';
import { SPECIES_BY_ID, SEASONS } from './species.js';
import { computeStats } from './stats.js';

let manualCounter = 1;

// 生成:锁定植株保持原位,其余按 种子+参数 重排
export function doGenerate() {
  const p = get(params);
  const s = get(seed);
  const locked = get(scene).plants.filter((pl) => pl.locked);
  const result = locked.length ? regenerate(p, s, locked) : generate(p, s);
  scene.set({ plants: result.plants, rocks: result.rocks });
  pickedPlant.set(null);
  boxSelected.set([]);
}

// 完全重新生成(忽略锁定)
export function doGenerateFresh() {
  const result = generate(get(params), get(seed));
  scene.set({ plants: result.plants, rocks: result.rocks });
  pickedPlant.set(null);
  boxSelected.set([]);
}

export function movePlant(id, x, y) {
  scene.update((sc) => ({
    ...sc,
    plants: sc.plants.map((pl) =>
      pl.id === id ? { ...pl, x: +x.toFixed(3), y: +y.toFixed(3), locked: true } : pl
    )
  }));
}

export function addPlant(spId, x, y) {
  const sp = SPECIES_BY_ID[spId];
  if (!sp) return;
  const size = samplePlantSize(spId, 'm' + manualCounter);
  const plant = {
    id: 'm' + manualCounter++,
    sp: spId,
    x: +x.toFixed(3),
    y: +y.toFixed(3),
    r: size.r,
    h: size.h,
    locked: true
  };
  scene.update((sc) => ({ ...sc, plants: [...sc.plants, plant] }));
  return plant;
}

export function removePlant(id) {
  scene.update((sc) => ({ ...sc, plants: sc.plants.filter((pl) => pl.id !== id) }));
  pickedPlant.set(null);
}

export function toggleLock(id) {
  scene.update((sc) => ({
    ...sc,
    plants: sc.plants.map((pl) => (pl.id === id ? { ...pl, locked: !pl.locked } : pl))
  }));
}

// 框选批量替换品种:保留位置,株高冠幅按新品种确定性取样,并打锁定标记
export function replaceSpecies(ids, spId) {
  const sp = SPECIES_BY_ID[spId];
  if (!sp || !ids.length) return;
  scene.update((sc) => ({
    ...sc,
    plants: sc.plants.map((pl) => {
      if (!ids.includes(pl.id)) return pl;
      const size = samplePlantSize(spId, pl.id);
      return { ...pl, sp: spId, h: size.h, r: size.r, locked: true };
    })
  }));
}

export function loadScene(saved) {
  params.set({ ...DEFAULT_PARAMS, ...saved.params });
  seed.set(saved.seed);
  scene.set({
    plants: saved.plants.map((pl) => ({ ...pl })),
    rocks: saved.rocks.map((rk) => ({ ...rk }))
  });
  pickedPlant.set(null);
  boxSelected.set([]);
}

// ---------- 自动评分 ----------
// 参数比对 40 分(8 项各 5 分),三季覆盖率 60 分(每季 20 分,偏差线性扣分)
export function autoScore(assignment, studentParams, studentScene) {
  const target = assignment.params;
  const mismatches = [];
  const checks = [
    ['length', '地块长', (a, b) => Math.abs(a - b) < 0.01],
    ['width', '地块宽', (a, b) => Math.abs(a - b) < 0.01],
    ['aspect', '坡向', (a, b) => a === b],
    ['water', '水系位置', (a, b) => a === b],
    ['density', '群落密度', (a, b) => Math.abs(a - b) < 0.03],
    ['bloomSpring', '春季花期权重', (a, b) => Math.abs(a - b) < 0.03],
    ['bloomSummer', '夏季花期权重', (a, b) => Math.abs(a - b) < 0.03],
    ['bloomAutumn', '秋季花期权重', (a, b) => Math.abs(a - b) < 0.03]
  ];
  let paramScore = 40;
  for (const [key, label, ok] of checks) {
    if (!ok(+studentParams[key] || studentParams[key], +target[key] || target[key])) {
      paramScore -= 5;
      mismatches.push(`${label}:应为 ${target[key]},实际 ${studentParams[key]}`);
    }
  }
  const st = computeStats(studentScene, studentParams);
  let covScore = 0;
  for (const s of SEASONS) {
    const diff = Math.abs(st.coverage[s] - assignment.targets[s]);
    const got = Math.max(0, 20 * (1 - diff / 0.3));
    covScore += got;
    if (diff > 0.05) {
      mismatches.push(
        `${{ spring: '春季', summer: '夏季', autumn: '秋季' }[s]}覆盖率:目标 ${(assignment.targets[s] * 100).toFixed(1)}%,实际 ${(st.coverage[s] * 100).toFixed(1)}%`
      );
    }
  }
  return {
    autoScore: Math.round(paramScore + covScore),
    paramScore,
    covScore: Math.round(covScore),
    coverage: { ...st.coverage },
    mismatches
  };
}
