// manifold-3d 封装:基元 -> Manifold 叶节点 -> 分组并集 -> 平衡并集 -> 差集的布尔 DAG
// DAG 以纯 JSON 描述(可随模型存入 IndexedDB),Manifold 实例只在 worker 内缓存
// manifold-3d v3.5 的工厂方法挂在 setup() 里,需显式调用
import Module from 'manifold-3d';

// Vite 会把 ?url 导入解析为打包后的真实 WASM 资源地址(worker 内同样可用)。
// Node 测试环境不识别 ?url,用动态 import + 回退,避免顶层静态依赖。
const wasmUrlPromise = import('manifold-3d/manifold.wasm?url')
  .then((m) => m.default)
  .catch(() => undefined);
// Node 下该动态 import 会以 rejection 落盘,显式吞掉这一环境差异
wasmUrlPromise.catch(() => undefined);

let M = null;

export async function initManifold() {
  if (M) return M;
  const wasmUrl = await wasmUrlPromise;
  // 显式 locateFile:绕过预打包后 import.meta.url 指向 dep 缓存导致的 wasm 404
  M = wasmUrl ? await Module({ locateFile: () => wasmUrl }) : await Module();
  // v3.5 的工厂方法挂在 setup() 里,需显式调用
  M.setup();
  return M;
}

function assertReady() {
  if (!M) throw new Error('manifold 尚未初始化');
}

// 平衡两两并集(比链式快数倍);输入数组元素会被消费(Manifold 所有权转移)
export function balancedUnion(manifolds) {
  if (manifolds.length === 0) throw new Error('balancedUnion: 空输入');
  let cur = manifolds;
  while (cur.length > 1) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2) {
      if (i + 1 < cur.length) next.push(cur[i].add(cur[i + 1]));
      else next.push(cur[i]);
    }
    cur = next;
  }
  return cur[0];
}

// 杆件体:manifold-3d v3.5 的 transform/rotate 对圆柱基元的懒变换在本版本不可靠
// (实测各种矩阵打包与欧拉角均无法稳定定向),改用两端点球的凸包(hull)生成 ——
// 方向由端点直接决定,端帽为半球且会被节点球完全包裹,布尔后与圆柱等价。
function makeCylinder(rec, segments) {
  const s1 = M.Manifold.sphere(rec.radius, segments).translate(rec.p1);
  const s2 = M.Manifold.sphere(rec.radius, segments).translate(rec.p2);
  return M.Manifold.hull([s1, s2]);
}

function makeSphere(rec, segments) {
  return M.Manifold.sphere(rec.radius, segments).translate(rec.center);
}

export function makeLeafManifold(rec, segments) {
  assertReady();
  if (rec.shape === 'sphere') return makeSphere(rec, segments);
  return makeCylinder(rec, segments);
}

// 把 getMesh() 的输出转成可序列化 + 可直接喂给 three 的普通对象
export function meshToSerializable(mesh) {
  return {
    numProp: mesh.numProp,
    vertProperties: Array.from(mesh.vertProperties),
    triVerts: Array.from(mesh.triVerts),
  };
}

// ---------- DAG 构建 ----------
// 分组键:横梁按 beamIndex;塔架按 -1;球节点归入对应梁组
function groupKey(rec) {
  if (rec.beamIndex != null && rec.beamIndex >= 0) return `beam:${rec.beamIndex}`;
  if (rec.towerIndex != null) return `tower:${rec.towerIndex}`;
  return rec.kind === 'sphere' ? 'other' : 'other';
}

// cell 键:同一节点位置的球 + 交汇杆件先做局部并集,降低全局布尔规模
function cellKey(rec) {
  if (rec.shape === 'sphere') return `node:${rec.nodeKey ?? 'x'}@${rec.beamIndex ?? rec.towerIndex}`;
  // 杆件归到其中点所在跨的节点 cell(简化:用 panel 字段)
  const owner = rec.beamIndex != null ? rec.beamIndex : `t${rec.towerIndex ?? 0}`;
  return `cell:${rec.kind}:${owner}:${rec.panel ?? 0}`;
}

export function buildDag(model) {
  // 叶节点
  const leaves = new Map();
  for (const rec of model.primitives) {
    leaves.set(rec.id, {
      id: rec.id,
      type: 'leaf',
      primitiveId: rec.id,
      group: groupKey(rec),
      cell: cellKey(rec),
      manifold: null, // worker 内运行时填充
    });
  }
  const cutterLeaves = new Map();
  for (const rec of model.cutters) {
    cutterLeaves.set(rec.id, { id: rec.id, type: 'cutter', primitiveId: rec.id, manifold: null });
  }

  // cell 并集:每个 cell 内的叶先平衡并
  const cellNodes = [];
  const cellMap = new Map();
  for (const leaf of leaves.values()) {
    if (!cellMap.has(leaf.cell)) {
      const node = { id: `cell:${cellNodes.length}`, type: 'cell', children: [], group: leaf.group };
      cellMap.set(leaf.cell, node);
      cellNodes.push(node);
    }
    cellMap.get(leaf.cell).children.push(leaf.id);
  }

  // 组并集(每根横梁 / 每座塔架各自一条链)
  const groupNames = [...new Set(cellNodes.map((c) => c.group))].sort();
  const groupNodes = groupNames.map((name, gi) => {
    const cells = cellNodes.filter((c) => c.group === name);
    return {
      id: `group:${gi}:${name}`,
      type: 'group',
      name,
      children: cells.map((c) => c.id),
    };
  });

  // 根并集
  const rootUnion = {
    id: 'root:union',
    type: 'union',
    children: groupNodes.map((g) => g.id),
  };

  // 根差集(螺栓孔)
  const rootDiff = {
    id: 'root:diff',
    type: 'diff',
    base: rootUnion.id,
    cutters: model.cutters.map((c) => c.id),
  };

  return {
    nodes: {
      leaves: Object.fromEntries(leaves.entries()),
      cutters: Object.fromEntries(cutterLeaves.entries()),
      cells: Object.fromEntries(cellNodes.map((c) => [c.id, c])),
      groups: Object.fromEntries(groupNodes.map((g) => [g.id, g])),
      rootUnion,
      rootDiff,
    },
    // 受影响成员 -> 需要重算的组映射,供增量编辑用
    memberToGroup: buildMemberGroupMap(model),
  };
}

function buildMemberGroupMap(model) {
  const map = new Map();
  for (const rec of model.primitives) {
    if (!rec.memberId) continue;
    const g = groupKey(rec);
    if (!map.has(rec.memberId)) map.set(rec.memberId, new Set());
    map.get(rec.memberId).add(g);
  }
  return Object.fromEntries([...map.entries()].map(([k, v]) => [k, [...v]]));
}

// ---------- DAG 求值(带节点缓存,支持增量) ----------
export class DagEvaluator {
  constructor(dag, segments) {
    this.dag = dag;
    this.segments = segments;
    this.cache = new Map(); // nodeId -> Manifold
    this.leafRecs = new Map(); // primitiveId -> rec
    this.timings = { leafMs: 0, cellMs: 0, groupMs: 0, unionMs: 0, diffMs: 0, totalMs: 0 };
    this.booleans = 0;
  }

  setPrimitives(model) {
    this.leafRecs = new Map();
    for (const rec of model.primitives) this.leafRecs.set(rec.id, rec);
    for (const rec of model.cutters) this.leafRecs.set(rec.id, rec);
  }

  _leaf(primitiveId) {
    if (this.cache.has(primitiveId)) return this.cache.get(primitiveId);
    const rec = this.leafRecs.get(primitiveId);
    const t0 = performance.now();
    const man = makeLeafManifold(rec, this.segments);
    this.timings.leafMs += performance.now() - t0;
    this.cache.set(primitiveId, man);
    return man;
  }

  _unionNode(nodeId, childIds, kind) {
    if (this.cache.has(nodeId)) return this.cache.get(nodeId);
    const t0 = performance.now();
    const parts = childIds.map((cid) => this._resolve(cid));
    const out = balancedUnion(parts.map((p) => p));
    this.booleans += Math.max(0, childIds.length - 1);
    const dt = performance.now() - t0;
    if (kind === 'cell') this.timings.cellMs += dt;
    else if (kind === 'group') this.timings.groupMs += dt;
    else this.timings.unionMs += dt;
    this.cache.set(nodeId, out);
    return out;
  }

  _resolve(nodeId) {
    if (this.cache.has(nodeId)) return this.cache.get(nodeId);
    const { nodes } = this.dag;
    if (nodes.leaves[nodeId] || nodes.cutters[nodeId]) {
      return this._leaf(nodes.leaves[nodeId] ? nodes.leaves[nodeId].primitiveId : nodeId);
    }
    if (nodes.cells[nodeId]) return this._unionNode(nodeId, nodes.cells[nodeId].children, 'cell');
    if (nodes.groups[nodeId]) return this._unionNode(nodeId, nodes.groups[nodeId].children, 'group');
    if (nodeId === nodes.rootUnion.id) {
      return this._unionNode(nodeId, nodes.rootUnion.children, 'root');
    }
    throw new Error(`未知 DAG 节点: ${nodeId}`);
  }

  // 全量求值
  evaluateAll() {
    assertReady();
    const t0 = performance.now();
    const base = this._resolve(this.dag.nodes.rootUnion.id);
    const t1 = performance.now();
    let result = base;
    if (this.dag.nodes.rootDiff.cutters.length > 0) {
      const cutParts = this.dag.nodes.rootDiff.cutters.map((cid) => this._resolve(cid));
      const cutterUnion = balancedUnion(cutParts);
      this.booleans += cutParts.length - 1;
      result = base.subtract(cutterUnion);
      this.booleans += 1;
    }
    this.timings.diffMs = performance.now() - t1;
    this.timings.totalMs = performance.now() - t0;
    return result;
  }

  // 增量:使某 primitive 叶及其上游组/根缓存失效
  invalidatePrimitive(primitiveId) {
    const { nodes } = this.dag;
    const leaf = nodes.leaves[primitiveId];
    this.cache.delete(primitiveId);
    if (!leaf) return;
    for (const [cid, cell] of Object.entries(nodes.cells)) {
      if (cell.children.includes(primitiveId)) this.cache.delete(cid);
    }
    for (const [gid, group] of Object.entries(nodes.groups)) {
      const stale = group.children.some((cid) => !this.cache.has(cid));
      if (stale) this.cache.delete(gid);
    }
    this.cache.delete(nodes.rootUnion.id);
    this.cache.delete(nodes.rootDiff.id);
  }

  // 单杆编辑后只重算受影响布尔链
  reevaluateAfterEdit(changedPrimitiveIds) {
    for (const pid of changedPrimitiveIds) this.invalidatePrimitive(pid);
    return this.evaluateAll();
  }

  getMeshResult(manifold) {
    const mesh = manifold.getMesh();
    return meshToSerializable(mesh);
  }
}
