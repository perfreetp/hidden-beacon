// 引擎自检：确定性 / 吸附 / 带锁重生成 / 差异对比 / 型号批量替换
import { generate, DEFAULT_PARAMS, liveSnap, buildGrid } from '../src/lib/engine/generate.js';
import { diffFacade } from '../src/lib/engine/diff.js';
import { getModel } from '../src/lib/engine/catalog.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name); }
}

console.log('1) 确定性：同参数同种子两次生成完全一致');
{
  const a = generate(DEFAULT_PARAMS);
  const b = generate(DEFAULT_PARAMS);
  check('设备/管线数量一致', a.devices.length === b.devices.length && a.pipes.length === b.pipes.length);
  check('坐标 JSON 完全相同', JSON.stringify(a) === JSON.stringify(b));
  const c = generate({ ...DEFAULT_PARAMS, seed: 'OTHER-SEED-9' });
  check('不同种子产生不同布局', JSON.stringify(c.devices) !== JSON.stringify(a.devices));
  check('类型齐全', a.devices.some((d) => d.type === 'desulf') && a.devices.some((d) => d.type === 'baghouse')
    && a.devices.some((d) => d.type === 'stack') && a.devices.some((d) => d.type === 'probe')
    && a.devices.some((d) => d.type === 'rack') && a.devices.some((d) => d.type === 'ladder'));
  check('烟囱在最后一个开间', a.devices.find((d) => d.type === 'stack').bay === DEFAULT_PARAMS.bays - 1);
  check('所有设备在总高度内', a.devices.every((d) => d.y + d.h <= a.grid.totalHeight));
  check('所有设备在宽度内', a.devices.every((d) => d.x + d.w <= a.bounds.width));
}

console.log('2) 带锁重生成：锁住局部保持原样，其余按新参数重排');
{
  const v1 = generate(DEFAULT_PARAMS);
  const lockDev = v1.devices.find((d) => d.id === 'D-desulf-b0');
  lockDev.x = 3.33; lockDev.locked = true;
  const lockPipe = v1.pipes.find((p) => p.id === 'P-h-main-b1');
  lockPipe.y1 = 12.34; lockPipe.y2 = 12.34; lockPipe.locked = true;

  const v2 = generate({ ...DEFAULT_PARAMS, bays: 6, gap: 1.5 }, v1);
  const kept = v2.devices.find((d) => d.id === 'D-desulf-b0');
  check('锁定设备坐标保持', kept.x === 3.33 && kept.locked === true);
  const keptPipe = v2.pipes.find((p) => p.id === 'P-h-main-b1');
  check('锁定管线坐标保持', keptPipe.y1 === 12.34 && keptPipe.locked === true);
  check('新增开间产生新构件', v2.devices.some((d) => d.bay === 5) && v2.pipes.some((p) => p.bay === 5));
  const unlocked = v2.devices.find((d) => d.id === 'D-baghouse-b1');
  check('未锁定设备按新间距重排（不再等于 v1 坐标）', unlocked.x !== v1.devices.find((d) => d.id === 'D-baghouse-b1').x);
  check('可见性在重生成中保留', v2.devices.every((d) => typeof d.visible === 'boolean'));

  // 被删掉开间里的锁定构件作为孤儿保留
  const v3 = generate({ ...DEFAULT_PARAMS, bays: 3 }, v1);
  check('孤儿锁定构件仍保留', v3.devices.some((d) => d.id === 'D-desulf-b0' && d.locked));
}

console.log('3) 吸附：最近轴线/层高线');
{
  const f = generate(DEFAULT_PARAMS);
  const grid = f.grid;
  const dev = f.devices.find((d) => d.type === 'baghouse' && !d.locked);
  dev.x = grid.axes[dev.bay] + 0.35;
  dev.y = 0.28;
  const r = liveSnap(dev, grid, 0, 0);
  check('x 吸附到开间左轴线', Math.abs(r.value.x - grid.axes[dev.bay]) < 1e-9);
  check('y 吸附到 0 层高线', Math.abs(r.value.y - 0) < 1e-9);
  const far = liveSnap(dev, grid, 2.0, 1.5);
  check('超出吸附阈值时保持跟手', far.value.x !== grid.axes[dev.bay] || far.value.y !== 0);

  const pipe = f.pipes.find((p) => p.id === 'P-h-main-b0');
  const pr = liveSnap(pipe, grid, 0, 0);
  check('管线整体平移且两端同步', Math.abs((pr.value.y1 - pipe.y1) - (pr.value.y2 - pipe.y2)) < 1e-9);
}

console.log('4) 差异对比：新增/删除/移动/未变');
{
  // 无锁定的独立两版，确保开间差异体现为新增/删除
  const v1 = generate(DEFAULT_PARAMS);
  const v2 = generate({ ...DEFAULT_PARAMS, bays: 6 });
  const diffGrow = diffFacade(v1, v2);
  check('存在新增项（6 开间比 5 开间多）', diffGrow.counts.added > 0);
  const diffShrink = diffFacade(v2, v1);
  check('存在删除项', diffShrink.counts.removed > 0);

  const moved = structuredClone(v2);
  const d0 = moved.devices.find((d) => d.type === 'desulf');
  d0.x += 1.0;
  const diff = diffFacade(v2, moved);
  check('存在移动项', diff.counts.moved >= 1);
  check('状态计数自洽', Object.values(diff.counts).reduce((s, n) => s + n, 0) === diff.items.length);
}

console.log('5) 型号库与批量换型尺寸');
{
  const m1 = getModel('desulf', 'TL-900');
  const m2 = getModel('desulf', 'TL-1200');
  check('型号尺寸递增', m2.w > m1.w && m2.h > m1.h);
  check('未知型号回退首个', getModel('stack', 'NOPE').model === 'YC-60');
}

console.log('6) 网格：轴数=开间+1，层高线覆盖总高');
{
  const g = buildGrid(DEFAULT_PARAMS);
  check('轴数 = 开间数 + 1', g.axes.length === DEFAULT_PARAMS.bays + 1);
  check('轴间距 = 跨度', Math.abs(g.axes[1] - g.axes[0] - DEFAULT_PARAMS.span) < 1e-9);
  check('层高线覆盖总高', g.floors[g.floors.length - 1] >= g.totalHeight - 1e-9);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
