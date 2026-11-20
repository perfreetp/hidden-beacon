// 建模 Web Worker:manifold WASM 全部在 worker 内运行
import { initManifold, buildDag, DagEvaluator, balancedUnion } from './manifoldDag.js';
import { buildArrayModel } from './geometry.js';

let ready = null;
let currentModel = null;
let dag = null;
let evaluator = null;
let lastParams = null;

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

async function ensureReady() {
  if (!ready) {
    ready = initManifold();
    await ready;
    post('ready');
  }
  return ready;
}

// 把成员长度改动应用到其所有圆柱基元(沿轴向缩放,中心不动)
function applyMemberLength(model, memberId, newLength) {
  const changed = [];
  for (const rec of model.primitives) {
    if (rec.memberId !== memberId) continue;
    const half = newLength / 2;
    rec.p1 = [
      rec.center[0] - rec.dir[0] * half,
      rec.center[1] - rec.dir[1] * half,
      rec.center[2] - rec.dir[2] * half,
    ];
    rec.p2 = [
      rec.center[0] + rec.dir[0] * half,
      rec.center[1] + rec.dir[1] * half,
      rec.center[2] + rec.dir[2] * half,
    ];
    rec.length = newLength;
    changed.push(rec.id);
  }
  const member = model.members.find((mm) => mm.memberId === memberId);
  if (member) {
    member.length = newLength;
    member.p1 = model.primitives.find((r) => r.memberId === memberId)?.p1 ?? member.p1;
    member.p2 = model.primitives.find((r) => r.memberId === memberId)?.p2 ?? member.p2;
  }
  return changed;
}

async function handleBuild(params) {
  await ensureReady();
  post('progress', { phase: 'generate', message: '生成基元与阵列...' });
  const model = buildArrayModel(params);
  currentModel = model;
  lastParams = params;

  post('progress', {
    phase: 'dag',
    message: `构建布尔 DAG(${model.stats.dedupedCount} 基元,已去重 ${model.stats.removedCount})...`,
  });
  dag = buildDag(model);
  evaluator = new DagEvaluator(dag, params.circularSegments ?? 16);
  evaluator.setPrimitives(model);

  post('progress', { phase: 'boolean', message: '执行并集 / 差集布尔运算...' });
  const t0 = performance.now();
  const manifold = evaluator.evaluateAll();
  const buildMs = performance.now() - t0;

  const mesh = evaluator.getMeshResult(manifold);
  post('done', {
    mesh,
    stats: {
      ...model.stats,
      triangleCount: mesh.triVerts.length / 3,
      vertexCount: mesh.vertProperties.length / mesh.numProp,
      buildMs,
      timings: evaluator.timings,
      booleans: evaluator.booleans,
    },
    model: serializeModel(model),
    dagSummary: {
      leafCount: Object.keys(dag.nodes.leaves).length,
      cellCount: Object.keys(dag.nodes.cells).length,
      groupCount: Object.keys(dag.nodes.groups).length,
      cutterCount: Object.keys(dag.nodes.cutters).length,
    },
  });
}

// 结构化克隆可直接序列化普通对象;函数之外均为纯数据
function serializeModel(model) {
  return {
    primitives: model.primitives,
    cutters: model.cutters,
    members: model.members,
    beamOrigins: model.beamOrigins,
    towerOrigins: model.towerOrigins,
    stats: model.stats,
  };
}

async function handleEdit(message) {
  if (!currentModel || !evaluator) {
    post('error', { message: '尚未建模,无法编辑' });
    return;
  }
  await ensureReady();
  const { memberId, newLength } = message;
  const changedIds = applyMemberLength(currentModel, memberId, newLength);
  if (changedIds.length === 0) {
    post('error', { message: '未找到该杆件对应的基元' });
    return;
  }
  post('progress', { phase: 'boolean', message: `增量重算受影响布尔链(${changedIds.length} 基元)...` });
  const t0 = performance.now();
  const manifold = evaluator.reevaluateAfterEdit(changedIds);
  const rebuildMs = performance.now() - t0;
  const mesh = evaluator.getMeshResult(manifold);
  post('editDone', {
    mesh,
    memberId,
    newLength,
    stats: {
      ...currentModel.stats,
      triangleCount: mesh.triVerts.length / 3,
      vertexCount: mesh.vertProperties.length / mesh.numProp,
      buildMs: rebuildMs,
      timings: evaluator.timings,
      booleans: evaluator.booleans,
      incremental: true,
      changedPrimitiveCount: changedIds.length,
    },
    model: serializeModel(currentModel),
  });
}

// 分部件导出:整段横梁(所有 beam 组 + 对应螺栓孔)与塔架(所有 tower 组)各自独立实体
async function handleExportParts() {
  if (!currentModel || !dag) {
    post('error', { message: '尚未建模,无法导出' });
    return;
  }
  await ensureReady();
  const groups = dag.nodes.groups;
  const beamGroupIds = Object.keys(groups).filter((gid) => gid.includes(':beam:'));
  const towerGroupIds = Object.keys(groups).filter((gid) => gid.includes(':tower:'));

  const buildPart = (groupIds, withHoles) => {
    const manifolds = groupIds.map((gid) => evaluator._resolve(gid));
    let part = balancedUnion(manifolds.map((x) => x));
    if (withHoles && dag.nodes.rootDiff.cutters.length > 0) {
      const cutParts = dag.nodes.rootDiff.cutters.map((cid) => evaluator._resolve(cid));
      part = part.subtract(balancedUnion(cutParts));
    }
    return evaluator.getMeshResult(part);
  };

  post('progress', { phase: 'export', message: '拆分横梁 / 塔架实体...' });
  const beamMesh = buildPart(beamGroupIds, true);
  const towerMesh = towerGroupIds.length > 0 ? buildPart(towerGroupIds, false) : null;
  post('exportDone', { beamMesh, towerMesh });
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'build') await handleBuild(msg.params);
    else if (msg.type === 'edit') await handleEdit(msg);
    else if (msg.type === 'exportParts') await handleExportParts();
    else if (msg.type === 'ping') post('pong');
  } catch (err) {
    post('error', { message: err?.message ?? String(err), stack: err?.stack });
  }
};
