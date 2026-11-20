import { SPECIES_BY_ID, SEASONS, SEASON_NAMES, LAYER_NAMES, bloomText } from './species.js';
import { waterDistance } from './generate.js';

function plantArea(p) {
  return Math.PI * p.r * p.r;
}

function rockArea(rk) {
  return Math.PI * rk.rx * rk.ry;
}

// 开花覆盖率:当季开花植株冠幅投影面积(去重近似按 capped 总和)/ 地块面积
export function coverageForSeason(plants, season, plotArea) {
  const idx = SEASONS.indexOf(season);
  let a = 0;
  for (const p of plants) {
    const sp = SPECIES_BY_ID[p.sp];
    if (sp && sp.bloom[idx]) a += plantArea(p);
  }
  return Math.min(1, a / plotArea);
}

export function computeStats(scene, params) {
  const plotArea = params.length * params.width;
  const perSpecies = new Map();
  const layerArea = { tree: 0, shrub: 0, herb: 0 };
  const layerCount = { tree: 0, shrub: 0, herb: 0 };
  for (const p of scene.plants) {
    const sp = SPECIES_BY_ID[p.sp];
    if (!sp) continue;
    const a = plantArea(p);
    layerArea[sp.layer] += a;
    layerCount[sp.layer]++;
    if (!perSpecies.has(p.sp)) {
      perSpecies.set(p.sp, { sp, count: 0, area: 0 });
    }
    const row = perSpecies.get(p.sp);
    row.count++;
    row.area += a;
  }
  const rockA = scene.rocks.reduce((s, r) => s + rockArea(r), 0);
  let waterA = 0;
  if (params.water !== '无') {
    waterA = params.water === '中央贯穿'
      ? params.length * params.waterWidth
      : params.waterWidth * (params.water === '北侧' || params.water === '南侧' ? params.length : params.width);
    waterA = Math.min(waterA, plotArea);
  }
  const coverage = {};
  for (const s of SEASONS) coverage[s] = coverageForSeason(scene.plants, s, plotArea);
  const vegArea = layerArea.tree + layerArea.shrub + layerArea.herb;

  return {
    plotArea,
    vegArea,
    rockArea: rockA,
    waterArea: waterA,
    layerArea,
    layerCount,
    coverage,
    totalPlants: scene.plants.length,
    lockedCount: scene.plants.filter((p) => p.locked).length,
    perSpecies: [...perSpecies.values()].sort((a, b) => b.area - a.area)
  };
}

export function configTableRows(stats) {
  return stats.perSpecies.map((r) => ({
    品种: r.sp.name,
    层次: LAYER_NAMES[r.sp.layer],
    数量: r.count,
    '面积(m²)': r.area.toFixed(1),
    '株高(m)': `${r.sp.hMin}~${r.sp.hMax}`,
    花期: bloomText(r.sp)
  }));
}

function toCsv(rows, headers) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
  return '﻿' + lines.join('\n');
}

export function downloadCsv(filename, rows, headers) {
  const csv = toCsv(rows, headers);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportConfigTable(stats, params, seed) {
  const rows = configTableRows(stats);
  downloadCsv(`植物配置表_${seed}.csv`, rows, ['品种', '层次', '数量', '面积(m²)', '株高(m)', '花期']);
}

export function exportAreaStats(stats, params, seed) {
  const rows = [
    { 项目: '地块面积', 数值: stats.plotArea.toFixed(1), 单位: 'm²' },
    { 项目: '植被投影面积', 数值: stats.vegArea.toFixed(1), 单位: 'm²' },
    { 项目: '乔木层面积', 数值: stats.layerArea.tree.toFixed(1), 单位: 'm²' },
    { 项目: '灌木层面积', 数值: stats.layerArea.shrub.toFixed(1), 单位: 'm²' },
    { 项目: '花草层面积', 数值: stats.layerArea.herb.toFixed(1), 单位: 'm²' },
    { 项目: '裸石面积', 数值: stats.rockArea.toFixed(1), 单位: 'm²' },
    { 项目: '水面面积', 数值: stats.waterArea.toFixed(1), 单位: 'm²' },
    { 项目: '总株数', 数值: stats.totalPlants, 单位: '株' },
    { 项目: '锁定株数', 数值: stats.lockedCount, 单位: '株' },
    ...SEASONS.map((s) => ({
      项目: `${SEASON_NAMES[s]}开花覆盖率`,
      数值: (stats.coverage[s] * 100).toFixed(1),
      单位: '%'
    }))
  ];
  downloadCsv(`面积统计_${seed}.csv`, rows, ['项目', '数值', '单位']);
}
