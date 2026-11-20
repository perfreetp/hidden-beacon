// Node 侧建模管线冒烟:几何生成 -> DAG -> 布尔 -> 增量编辑(不依赖浏览器)
import { DEFAULT_PARAMS } from '../src/model/params.js';
import { buildArrayModel } from '../src/model/geometry.js';
import { initManifold, buildDag, DagEvaluator } from '../src/model/manifoldDag.js';

const params = { ...DEFAULT_PARAMS, span: 8000, panelLength: 1000, cols: 2, rows: 1, circularSegments: 16 };
const model = buildArrayModel(params);
console.log('primitives', model.stats);

await initManifold();
const dag = buildDag(model);
const ev = new DagEvaluator(dag, params.circularSegments);
ev.setPrimitives(model);
const man = ev.evaluateAll();
console.log('boolean tri', man.numTri(), 'status', man.status(), 'ms', ev.timings.totalMs.toFixed(1), 'ops', ev.booleans);

// 增量:改一根弦杆长度,只重算受影响布尔链
const target = model.members.find((m) => m.type === 'chord');
const rec = model.primitives.find((r) => r.memberId === target.memberId);
const before = man.numTri();
rec.length *= 1.2;
const h = rec.length / 2;
rec.p1 = rec.center.map((c, i) => c - rec.dir[i] * h);
rec.p2 = rec.center.map((c, i) => c + rec.dir[i] * h);
const t0 = performance.now();
const man2 = ev.reevaluateAfterEdit([rec.id]);
console.log('incremental tri', man2.numTri(), '(before', before + ') ms', (performance.now() - t0).toFixed(1));
if (man2.status() !== 'NoError') process.exit(1);
