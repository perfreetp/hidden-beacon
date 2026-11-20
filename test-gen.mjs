import { generate, regenerate, DEFAULT_PARAMS } from './src/lib/generate.js';
import { computeStats } from './src/lib/stats.js';

const p = { ...DEFAULT_PARAMS };
const a = generate(p, 'test-1');
const b = generate(p, 'test-1');
const c = generate(p, 'test-2');

const same = JSON.stringify(a.plants) === JSON.stringify(b.plants);
const diff = JSON.stringify(a.plants) !== JSON.stringify(c.plants);
console.log('同参数同种子一致:', same);
console.log('不同种子不同结果:', diff);
console.log('株数:', a.plants.length, '裸石:', a.rocks.length);

// 锁定保留
const locked = a.plants.slice(0, 5).map((pl) => ({ ...pl, locked: true, x: pl.x + 1 }));
const re = regenerate(p, 'test-1', locked);
const keptOk = locked.every((lk) => re.plants.some((pl) => pl.id === lk.id && pl.x === lk.x && pl.locked));
console.log('锁定植株全部保留原位:', keptOk);
console.log('重排后总株数:', re.plants.length);

const st = computeStats(re, p);
console.log('覆盖率 春/夏/秋:',
  (st.coverage.spring * 100).toFixed(1) + '%',
  (st.coverage.summer * 100).toFixed(1) + '%',
  (st.coverage.autumn * 100).toFixed(1) + '%');
console.log('层株数:', JSON.stringify(st.layerCount));
console.log('品种数:', st.perSpecies.length);
