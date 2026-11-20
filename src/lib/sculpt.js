import * as BABYLON from '@babylonjs/core';

// 雕刻引擎：笔刷 / 软选择衰减 / 轴向镜像 / 母线锁 / 封口边缘环保护 / 笔划级撤销
export const BRUSHES = [
  { key: 'grab', label: '拉伸' },
  { key: 'smooth', label: '平滑' },
  { key: 'inflate', label: '膨胀' },
  { key: 'flatten', label: '压平' }
];

function buildAdjacency(indices, vertCount) {
  const adj = Array.from({ length: vertCount }, () => []);
  const seen = Array.from({ length: vertCount }, () => new Set());
  for (let k = 0; k < indices.length; k += 3) {
    const tri = [indices[k], indices[k + 1], indices[k + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      if (!seen[a].has(b)) { seen[a].add(b); adj[a].push(b); }
      if (!seen[b].has(a)) { seen[b].add(a); adj[b].push(a); }
    }
  }
  return adj;
}

export class Sculptor {
  constructor(mesh, positions, indices, boundarySet) {
    this.mesh = mesh;
    this.positions = positions;          // Float32Array，直接作为真源
    this.indices = indices;
    this.boundary = boundarySet;         // 封口边缘环顶点集合（受保护）
    this.vertCount = positions.length / 3;
    this.neighbors = buildAdjacency(indices, this.vertCount);
    this.normals = new Float32Array(positions.length);

    // 笔刷参数（由 UI 写入）
    this.brush = 'inflate';
    this.radius = 12;                    // mm
    this.strength = 0.5;                 // 0..1
    this.falloff = 'smooth';             // linear | smooth | sharp
    this.mirror = true;                  // 轴向镜像（过轴线的 X=0 平面）
    this.rootLock = false;               // 母线锁：冻结根部区 + 抑制轴向分量
    this.rootZone = 14;                  // 根部冻结区高度 mm

    this.undoStack = [];
    this.redoStack = [];
    this.stroke = null;

    // 回调（UI 挂载）
    this.onBoundaryTouch = null;         // 笔刷蹭到封口边缘环
    this.onStrokeEnd = null;

    this.recomputeNormals();
  }

  falloffWeight(t) {
    const u = 1 - Math.min(1, t);
    if (this.falloff === 'linear') return u;
    if (this.falloff === 'sharp') return u * u * u;
    return u * u * (3 - 2 * u); // smoothstep
  }

  recomputeNormals() {
    BABYLON.VertexData.ComputeNormals(this.positions, this.indices, this.normals);
  }

  commitMesh() {
    this.recomputeNormals();
    this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, this.positions);
    this.mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, this.normals);
    this.mesh.refreshBoundingInfo();
  }

  avgNormalNear(point) {
    const r2 = this.radius * this.radius;
    let nx = 0, ny = 0, nz = 0, hit = false;
    for (let i = 0; i < this.vertCount; i++) {
      const dx = this.positions[i * 3] - point.x;
      const dy = this.positions[i * 3 + 1] - point.y;
      const dz = this.positions[i * 3 + 2] - point.z;
      if (dx * dx + dy * dy + dz * dz < r2) {
        nx += this.normals[i * 3]; ny += this.normals[i * 3 + 1]; nz += this.normals[i * 3 + 2];
        hit = true;
      }
    }
    if (!hit || (nx === 0 && ny === 0 && nz === 0)) return new BABYLON.Vector3(0, 1, 0);
    return new BABYLON.Vector3(nx, ny, nz).normalize();
  }

  // 起笔：记录一次笔划（快照进入撤销栈）
  beginStroke(point) {
    this.stroke = {
      before: this.positions.slice(),
      last: point.clone(),
      flattenPoint: point.clone(),
      flattenNormal: this.avgNormalNear(point)
    };
  }

  // 拖拽中：hit 为当前拾取点
  applyAt(point) {
    if (!this.stroke) return;
    const delta = point.subtract(this.stroke.last);
    this.stroke.last = point.clone();

    const ctx = { delta, flatN: this.stroke.flattenNormal, flatP: this.stroke.flattenPoint };
    this.pass(point, ctx);
    if (this.mirror) {
      const mp = new BABYLON.Vector3(-point.x, point.y, point.z);
      const mctx = {
        delta: new BABYLON.Vector3(-delta.x, delta.y, delta.z),
        flatN: new BABYLON.Vector3(-ctx.flatN.x, ctx.flatN.y, ctx.flatN.z),
        flatP: new BABYLON.Vector3(-ctx.flatP.x, ctx.flatP.y, ctx.flatP.z)
      };
      this.pass(mp, mctx);
    }
    this.commitMesh();
  }

  pass(center, ctx) {
    const r = this.radius, r2 = r * r;
    const pos = this.positions;
    const src = this.brush === 'smooth' ? pos.slice() : pos;
    let touchedBoundary = false;

    for (let i = 0; i < this.vertCount; i++) {
      const ix = i * 3;
      const px = pos[ix], py = pos[ix + 1], pz = pos[ix + 2];
      const dx = px - center.x, dy = py - center.y, dz = pz - center.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;

      if (this.boundary.has(i)) { touchedBoundary = true; continue; } // 封口边缘环：只挡不动
      if (this.rootLock && py < this.rootZone) continue;              // 根部冻结区

      const w = this.falloffWeight(Math.sqrt(d2) / r) * this.strength;
      if (w <= 0) continue;

      let mx = 0, my = 0, mz = 0;
      switch (this.brush) {
        case 'grab':
          mx = ctx.delta.x * w; my = ctx.delta.y * w; mz = ctx.delta.z * w;
          break;
        case 'inflate':
          mx = this.normals[ix] * w * 1.6;
          my = this.normals[ix + 1] * w * 1.6;
          mz = this.normals[ix + 2] * w * 1.6;
          break;
        case 'smooth': {
          const nb = this.neighbors[i];
          let ax = 0, ay = 0, az = 0;
          for (const j of nb) { ax += src[j * 3]; ay += src[j * 3 + 1]; az += src[j * 3 + 2]; }
          const inv = 1 / nb.length, k = w * 0.9;
          mx = (ax * inv - px) * k; my = (ay * inv - py) * k; mz = (az * inv - pz) * k;
          break;
        }
        case 'flatten': {
          const dist = (px - ctx.flatP.x) * ctx.flatN.x +
                       (py - ctx.flatP.y) * ctx.flatN.y +
                       (pz - ctx.flatP.z) * ctx.flatN.z;
          mx = -ctx.flatN.x * dist * w;
          my = -ctx.flatN.y * dist * w;
          mz = -ctx.flatN.z * dist * w;
          break;
        }
      }
      if (this.rootLock) my = 0; // 母线锁：去掉轴向分量，防止带歪根部
      pos[ix] += mx; pos[ix + 1] += my; pos[ix + 2] += mz;
    }

    if (touchedBoundary && this.onBoundaryTouch) this.onBoundaryTouch();
  }

  // 收笔：整段拖拽作为一个撤销单元入栈
  endStroke() {
    if (!this.stroke) return;
    this.undoStack.push({ before: this.stroke.before, after: this.positions.slice() });
    this.redoStack.length = 0;
    this.stroke = null;
    if (this.onStrokeEnd) this.onStrokeEnd();
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return false;
    this.redoStack.push(e);
    this.positions.set(e.before);
    this.commitMesh();
    return true;
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return false;
    this.undoStack.push(e);
    this.positions.set(e.after);
    this.commitMesh();
    return true;
  }
}
