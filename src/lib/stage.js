import * as BABYLON from '@babylonjs/core';
import { buildProfile, makeLathe, boundaryVertices, CONE_CTRL } from './cone.js';

// 场景：相机(右键旋转/中键平移/滚轮缩放)、灯光、应力锥本体、外屏蔽层、对称轴
export function buildStage(canvas) {
  const engine = new BABYLON.Engine(canvas, true, { stencil: true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.075, 0.085, 0.1, 1);

  const camera = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 2.4, 300,
    new BABYLON.Vector3(0, 58, 0), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 60;
  camera.upperRadiusLimit = 900;
  camera.wheelPrecision = 3;
  // 左键留给雕刻：旋转只用右键，平移用中键
  const pointers = camera.inputs.attached.pointers;
  pointers.buttons = [2];
  if ('panningMouseButton' in pointers) pointers.panningMouseButton = 1;

  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.75;
  const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-0.5, -0.8, 0.4), scene);
  dir.intensity = 0.7;

  // --- 应力锥本体（可雕刻） ---
  const profile = buildProfile(90);
  const lathe = makeLathe(profile, 96);
  const coneMesh = new BABYLON.Mesh('stressCone', scene);
  const normals = new Float32Array(lathe.positions.length);
  BABYLON.VertexData.ComputeNormals(lathe.positions, lathe.indices, normals);
  const vd = new BABYLON.VertexData();
  vd.positions = lathe.positions;
  vd.indices = lathe.indices;
  vd.normals = normals;
  vd.applyToMesh(coneMesh, true); // updatable

  const coneMat = new BABYLON.StandardMaterial('coneMat', scene);
  coneMat.diffuseColor = new BABYLON.Color3(0.62, 0.72, 0.86);
  coneMat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
  coneMat.backFaceCulling = false;
  coneMesh.material = coneMat;
  coneMesh.edgesColor = new BABYLON.Color4(0.95, 0.95, 1, 0.55);

  // --- 外屏蔽层（可临时隐藏） ---
  const yMin = 14, yMax = 92, offset = 6;
  const shieldProfile = profile.filter(p => p.y >= yMin && p.y <= yMax)
    .map(p => ({ y: p.y, r: p.r + offset }));
  const shieldLathe = makeLathe(shieldProfile, 96);
  const shieldMesh = new BABYLON.Mesh('shield', scene);
  const shieldNormals = new Float32Array(shieldLathe.positions.length);
  BABYLON.VertexData.ComputeNormals(shieldLathe.positions, shieldLathe.indices, shieldNormals);
  const svd = new BABYLON.VertexData();
  svd.positions = shieldLathe.positions;
  svd.indices = shieldLathe.indices;
  svd.normals = shieldNormals;
  svd.applyToMesh(shieldMesh, false);
  const shieldMat = new BABYLON.StandardMaterial('shieldMat', scene);
  shieldMat.diffuseColor = new BABYLON.Color3(0.95, 0.55, 0.2);
  shieldMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
  shieldMat.alpha = 0.32;
  shieldMat.backFaceCulling = false;
  shieldMesh.material = shieldMat;

  // --- 对称轴参考线 ---
  const axisLine = BABYLON.MeshBuilder.CreateLines('axis', {
    points: [new BABYLON.Vector3(0, -12, 0), new BABYLON.Vector3(0, 132, 0)]
  }, scene);
  axisLine.color = new BABYLON.Color3(1, 0.25, 0.25);
  axisLine.alpha = 0.6;

  const boundary = boundaryVertices(lathe.indices, lathe.vertCount);

  engine.runRenderLoop(() => scene.render());

  return {
    engine, scene, camera, coneMesh, coneMat, shieldMesh, axisLine,
    positions: lathe.positions,
    indices: lathe.indices,
    rows: lathe.rows,
    segments: lathe.segments,
    vertCount: lathe.vertCount,
    boundary,
    coneHeight: CONE_CTRL[CONE_CTRL.length - 1][0]
  };
}
