// 冒烟测试：网格生成 -> 雕刻一笔 -> 撤销/重做 -> 轴偏移/边界检测
import { buildProfile, makeLathe, boundaryVertices, axisOffset, boundingBox } from './src/lib/cone.js';
import { Sculptor } from './src/lib/sculpt.js';
import * as BABYLON from '@babylonjs/core';

const profile = buildProfile(90);
const lathe = makeLathe(profile, 96);
console.log('verts:', lathe.vertCount, 'faces:', lathe.indices.length / 3);

const boundary = boundaryVertices(lathe.indices, lathe.vertCount);
console.log('boundary verts (封口环):', boundary.size, 'expect', 96 * 2);

// 假 mesh，只拦截 updateVerticesData
const fakeMesh = {
  updateVerticesData() {}, refreshBoundingInfo() {}
};
const s = new Sculptor(fakeMesh, lathe.positions, lathe.indices, boundary);
console.log('axis offset before:', axisOffset(lathe.positions, lathe.rows, lathe.segments).toFixed(4), 'mm');

// 关镜像，在 x=+r 处膨胀一笔 -> 应产生轴偏移
s.mirror = false;
s.brush = 'inflate';
s.strength = 1;
s.radius = 15;
const p = new BABYLON.Vector3(57, 42, 0);
s.beginStroke(p);
for (let k = 0; k < 5; k++) s.applyAt(p);
s.endStroke();
const dev = axisOffset(lathe.positions, lathe.rows, lathe.segments);
console.log('axis offset after inflate:', dev.toFixed(4), 'mm', dev > 0.5 ? '(>0.5 标红 ✓)' : '');

// 边界环未被动过
let boundaryMoved = false;
for (const i of boundary) {
  // 与初始快照对比
  if (Math.abs(lathe.positions[i * 3] - s.undoStack[0].before[i * 3]) > 1e-9) { boundaryMoved = true; break; }
}
console.log('boundary ring untouched:', !boundaryMoved);

// 撤销 -> 回退整笔
s.undo();
console.log('axis offset after undo:', axisOffset(lathe.positions, lathe.rows, lathe.segments).toFixed(4), 'mm');
// 重做
s.redo();
console.log('axis offset after redo:', axisOffset(lathe.positions, lathe.rows, lathe.segments).toFixed(4), 'mm');

// 母线锁：根部冻结
s.undo();
s.rootLock = true;
s.beginStroke(new BABYLON.Vector3(31, 5, 0));
s.applyAt(new BABYLON.Vector3(31, 5, 0));
s.endStroke();
let rootMoved = false;
for (let i = 0; i < lathe.vertCount; i++) {
  if (lathe.positions[i * 3 + 1] < s.rootZone) {
    const before = s.undoStack[s.undoStack.length - 1].before;
    if (Math.abs(lathe.positions[i * 3] - before[i * 3]) > 1e-9) { rootMoved = true; break; }
  }
}
console.log('root zone frozen with 母线锁:', !rootMoved);

const bb = boundingBox(lathe.positions);
console.log('bbox size:', bb.size.map(v => v.toFixed(1)).join(' x '), 'mm');
console.log('SMOKE OK');
