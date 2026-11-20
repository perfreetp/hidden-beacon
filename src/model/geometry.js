// 基元级几何描述(纯数据,与 manifold 解耦):球节点 / 弦杆(圆柱) / 腹杆(圆柱)
import {
  beamHeight,
  panelCount,
  getChordSpec,
  webSpec,
  sphereRadius,
  primitiveHash,
} from './params.js';

let uidCounter = 0;
function nextId(prefix) {
  uidCounter += 1;
  return `${prefix}${uidCounter}`;
}

function vadd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function vsub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function vlen(a) {
  return Math.hypot(a[0], a[1], a[2]);
}
function vmid(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

// 圆柱基元(两端点、半径)。axis 在布尔阶段由方向推导,这里先存端点
function cylinderPrimitive(kind, p1, p2, radius, memberId, meta = {}) {
  const center = vmid(p1, p2);
  const length = vlen(vsub(p2, p1));
  const dir = vlen(vsub(p2, p1)) > 0 ? vsub(p2, p1).map((d) => d / length) : [1, 0, 0];
  return {
    id: nextId('p'),
    kind, // 'chord' | 'web' | 'leg' | 'towerWeb' | 'towerRing'
    shape: 'cylinder',
    p1: p1.slice(),
    p2: p2.slice(),
    center,
    dir,
    length,
    radius,
    memberId,
    ...meta,
  };
}

function spherePrimitive(center, radius, nodeKey, meta = {}) {
  return {
    id: nextId('p'),
    kind: 'sphere',
    shape: 'sphere',
    center: center.slice(),
    radius,
    axis: null,
    nodeKey,
    ...meta,
  };
}

// ---------- 单根横梁(Pratt 桁架,2D 布局于 z=0 平面) ----------
export function buildBeamPrimitives(params, origin = [0, 0, 0], beamIndex = 0) {
  const chord = getChordSpec(params.chordSpecId);
  const web = webSpec(chord);
  const H = beamHeight(params);
  const n = panelCount(params);
  const p = params.panelLength;
  const rNode = sphereRadius(chord.outerDiameter, web.outerDiameter);

  const primitives = [];
  const memberIndex = []; // memberId -> {type, label, p1, p2, length, beamIndex}
  const regMember = (type, label, p1, p2) => {
    const memberId = nextId('m');
    memberIndex.push({
      memberId,
      type,
      label: `横梁${beamIndex + 1}-${label}`,
      p1: p1.slice(),
      p2: p2.slice(),
      length: vlen(vsub(p2, p1)),
      beamIndex,
    });
    return memberId;
  };

  const top = (i) => vadd(origin, [i * p, H, 0]);
  const bot = (i) => vadd(origin, [i * p, 0, 0]);

  // 弦杆:上下弦各 n 段
  for (let i = 0; i < n; i += 1) {
    let mid = regMember('chord', `上弦-${i + 1}`, top(i), top(i + 1));
    primitives.push(
      cylinderPrimitive('chord', top(i), top(i + 1), chord.outerDiameter / 2, mid, {
        beamIndex,
        panel: i,
      }),
    );
    mid = regMember('chord', `下弦-${i + 1}`, bot(i), bot(i + 1));
    primitives.push(
      cylinderPrimitive('chord', bot(i), bot(i + 1), chord.outerDiameter / 2, mid, {
        beamIndex,
        panel: i,
      }),
    );
  }

  // 腹杆:Pratt 布置 —— 每节间一根斜撑(朝跨中) + 端竖杆;内部竖杆交替
  for (let i = 0; i < n; i += 1) {
    const towardMid = i < n / 2;
    const a = towardMid ? bot(i) : top(i);
    const b = towardMid ? top(i + 1) : bot(i + 1);
    const mid = regMember('web', `斜撑-${i + 1}`, a, b);
    primitives.push(
      cylinderPrimitive('web', a, b, web.outerDiameter / 2, mid, { beamIndex, panel: i }),
    );
    // 竖杆:每个节点一根(端部 + 内部)
    const vmid2 = regMember('web', `竖杆-${i + 1}`, bot(i), top(i));
    primitives.push(
      cylinderPrimitive('web', bot(i), top(i), web.outerDiameter / 2, vmid2, {
        beamIndex,
        panel: i,
      }),
    );
  }
  // 末端竖杆(最后一个节点)
  const lastV = regMember('web', `竖杆-${n + 1}`, bot(n), top(n));
  primitives.push(
    cylinderPrimitive('web', bot(n), top(n), web.outerDiameter / 2, lastV, {
      beamIndex,
      panel: n,
    }),
  );

  // 球节点:上下弦每个节点一个
  for (let i = 0; i <= n; i += 1) {
    primitives.push(
      spherePrimitive(top(i), rNode, `T${i}`, { beamIndex, node: `T${i}` }),
      spherePrimitive(bot(i), rNode, `B${i}`, { beamIndex, node: `B${i}` }),
    );
  }

  return { primitives, memberIndex, height: H };
}

// ---------- 塔架(4 腿方形桁架,立于横梁左端下方) ----------
export function buildTowerPrimitives(params, beamOrigin = [0, 0, 0], towerIndex = 0) {
  const chord = getChordSpec(params.chordSpecId);
  const web = webSpec(chord);
  const rNode = sphereRadius(chord.outerDiameter, web.outerDiameter);
  const w = params.towerWidth;
  const H = params.towerHeight;
  const p = params.towerPanelLength;
  const n = Math.max(1, Math.round(H / p));

  const primitives = [];
  const memberIndex = [];
  const regMember = (type, label, p1, p2) => {
    const memberId = nextId('m');
    memberIndex.push({
      memberId,
      type,
      label: `塔架${towerIndex + 1}-${label}`,
      p1: p1.slice(),
      p2: p2.slice(),
      length: vlen(vsub(p2, p1)),
      beamIndex: -1,
    });
    return memberId;
  };

  // 塔顶与梁底弦节点齐平:塔从 y = beamOrigin.y - H 延伸到 beamOrigin.y
  const yAt = (i) => beamOrigin[1] - H + (i * H) / n;
  const corners = (i) => {
    const y = yAt(i);
    const h = w / 2;
    return [
      [beamOrigin[0] - h, y, -h],
      [beamOrigin[0] + h, y, -h],
      [beamOrigin[0] + h, y, h],
      [beamOrigin[0] - h, y, h],
    ];
  };

  // 4 条腿
  for (let leg = 0; leg < 4; leg += 1) {
    for (let i = 0; i < n; i += 1) {
      const c0 = corners(i)[leg];
      const c1 = corners(i + 1)[leg];
      const mid = regMember('leg', `腿L${leg + 1}-${i + 1}`, c0, c1);
      primitives.push(cylinderPrimitive('leg', c0, c1, chord.outerDiameter / 2, mid, { towerIndex }));
    }
  }
  // 水平环 + 斜撑(每个面)
  for (let i = 0; i <= n; i += 1) {
    const c = corners(i);
    for (let e = 0; e < 4; e += 1) {
      const mid = regMember('towerRing', `环-${i + 1}-${e + 1}`, c[e], c[(e + 1) % 4]);
      primitives.push(
        cylinderPrimitive('towerRing', c[e], c[(e + 1) % 4], web.outerDiameter / 2, mid, {
          towerIndex,
        }),
      );
    }
  }
  for (let i = 0; i < n; i += 1) {
    const c0 = corners(i);
    const c1 = corners(i + 1);
    // 4 个面各一根斜撑
    for (let e = 0; e < 4; e += 1) {
      const e2 = (e + 1) % 4;
      const mid = regMember('towerWeb', `塔斜-${i + 1}-${e + 1}`, c0[e], c1[e2]);
      primitives.push(
        cylinderPrimitive('towerWeb', c0[e], c1[e2], web.outerDiameter / 2, mid, { towerIndex }),
      );
    }
  }
  // 球节点
  for (let i = 0; i <= n; i += 1) {
    for (let leg = 0; leg < 4; leg += 1) {
      primitives.push(
        spherePrimitive(corners(i)[leg], rNode, `TW${i}-${leg}`, { towerIndex }),
      );
    }
  }

  return { primitives, memberIndex };
}

// ---------- 螺栓孔刀具:梁-塔连接处 4 个圆柱(沿 y 向,切穿下弦) ----------
export function buildBoltCutters(params, beamOrigin = [0, 0, 0]) {
  const chord = getChordSpec(params.chordSpecId);
  const depth = params.holeDepth ?? chord.outerDiameter;
  const r = params.holeDiameter / 2;
  // 2x2 布置,沿 x/z 方向,落在第一跨内侧,避开端节点球
  const dx = params.towerWidth * 0.32;
  const dz = params.towerWidth * 0.32;
  const x0 = beamOrigin[0] + params.panelLength * 0.5;
  const yTop = beamOrigin[1] + chord.outerDiameter / 2 + 1; // 略切入
  const cutters = [];
  const signs = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [sx, sz] of signs) {
    const cx = x0 + sx * dx;
    const cz = sz * dz;
    cutters.push({
      id: nextId('p'),
      kind: 'cutter',
      shape: 'cylinder',
      p1: [cx, yTop, cz],
      p2: [cx, yTop - depth, cz],
      center: [cx, yTop - depth / 2, cz],
      dir: [0, -1, 0],
      length: depth,
      radius: r,
      memberId: null,
    });
  }
  return cutters;
}

// ---------- 整阵列生成 + 世界坐标哈希去重 ----------
export function buildArrayModel(params) {
  const H = beamHeight(params);
  const rowPitch = H + params.rowGap;
  const allPrimitives = [];
  const allMembers = [];
  const beamOrigins = [];

  for (let row = 0; row < params.rows; row += 1) {
    for (let col = 0; col < params.cols; col += 1) {
      const origin = [col * params.span, row * rowPitch, 0];
      beamOrigins.push(origin);
      const beam = buildBeamPrimitives(params, origin, row * params.cols + col);
      allPrimitives.push(...beam.primitives);
      allMembers.push(...beam.memberIndex);
    }
  }

  // 塔架:只在最左列每根横梁下各一座
  const towerOrigins = [];
  if (params.towerEnabled) {
    for (let row = 0; row < params.rows; row += 1) {
      const origin = [0, row * rowPitch, 0];
      towerOrigins.push(origin);
      const tower = buildTowerPrimitives(params, origin, row);
      allPrimitives.push(...tower.primitives);
      allMembers.push(...tower.memberIndex);
    }
  }

  // 螺栓孔刀具(每根横梁一套,位置在梁局部坐标)
  const cutters = [];
  for (const origin of beamOrigins) {
    cutters.push(...buildBoltCutters(params, origin));
  }

  // 世界坐标哈希去重:同哈希只保留一个基元,减少布尔次数
  const seen = new Map();
  const deduped = [];
  let removed = 0;
  for (const rec of allPrimitives) {
    const h = primitiveHash(rec);
    if (seen.has(h)) {
      removed += 1;
      continue;
    }
    seen.set(h, rec.id);
    deduped.push(rec);
  }

  return {
    primitives: deduped,
    cutters,
    members: allMembers,
    beamOrigins,
    towerOrigins,
    stats: {
      rawCount: allPrimitives.length,
      dedupedCount: deduped.length,
      removedCount: removed,
      cutterCount: cutters.length,
      memberCount: allMembers.length,
    },
  };
}
