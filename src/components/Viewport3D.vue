<template>
  <div class="vp-wrap">
    <canvas ref="canvasRef" class="vp-canvas"></canvas>
    <div v-if="store.draft.closed" class="vp-badge">
      {{ store.draft.revolve ? `🌀 旋转 ${store.draft.angle}°` : `🧱 厚度 ${store.draft.thickness.toFixed(1)}` }}
    </div>
    <div v-if="store.hasOverlap" class="vp-warn">⚠️ 红色描边的积木穿模啦,拖动分开它们</div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector2,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  Mesh,
  PolygonMeshBuilder,
  StandardMaterial,
  PointerDragBehavior,
  PointerEventTypes,
  Tools,
  Animation,
  CubicEase,
  EasingFunction,
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';
import { store } from '../store';
import { applyCorners, ensureCCW, bbox } from '../geometry';

const DRAFT_COLOR = '#4fc3f7';

const canvasRef = ref(null);
let engine = null;
let scene = null;
let camera = null;
let resizeObserver = null;

let draftMesh = null;
let extrudeHandle = null;
let angleHandle = null;
let axisMarker = null;
const copyMeshes = new Map(); // id -> mesh

let dragStartThickness = 1.5;
let dragStartAngle = 360;

defineExpose({ setView, exportImage });

// ---------- 建模 ----------
function buildShapeMesh(name, shape, colorHex) {
  const pts = applyCorners(ensureCCW(shape.points), shape.cornerMode, shape.cornerRadius);
  let mesh;
  if (shape.revolve) {
    // 绕轴回转:草图是侧面轮廓(x=到轴的距离,y=高度)
    const minY = Math.min(...pts.map((p) => p.y));
    const profile = pts.map(
      (p) => new Vector3(Math.max(0.05, p.x - shape.axisX), p.y - minY, 0)
    );
    profile.push(profile[0].clone());
    mesh = MeshBuilder.CreateLathe(name, {
      shape: profile,
      arc: Math.min(1, Math.max(15 / 360, shape.angle / 360)),
      tessellation: 64,
      sideOrientation: Mesh.DOUBLESIDE,
      cap: shape.angle >= 360 ? Mesh.NO_CAP : Mesh.CAP_ALL,
    }, scene);
  } else {
    // 拉伸:草图是俯视轮廓,沿 Y 轴拉厚
    const builder = new PolygonMeshBuilder(
      name,
      pts.map((p) => new Vector2(p.x, p.y)),
      scene
    );
    mesh = builder.build(false, Math.max(0.2, shape.thickness));
    mesh.enableEdgesRendering(0.6);
    mesh.edgesWidth = 2.5;
    mesh.edgesColor = new Color4(0.1, 0.2, 0.35, 0.4);
  }
  const mat = new StandardMaterial(name + '-mat', scene);
  const c = Color3.FromHexString(colorHex);
  mat.diffuseColor = c;
  mat.specularColor = new Color3(0.12, 0.12, 0.12);
  mat.backFaceCulling = false;
  mesh.material = mat;
  mesh.metadata = { baseColor: colorHex, overlap: false };
  return mesh;
}

function positionDraft() {
  if (!draftMesh) return;
  const d = store.draft;
  draftMesh.position.x = store.draftPos.x + (d.revolve ? d.axisX : 0);
  draftMesh.position.z = store.draftPos.z;
}

function rebuildDraft() {
  // 手柄挂在草稿积木上,先摘掉再重建
  for (const h of [extrudeHandle, angleHandle, axisMarker]) {
    if (h) h.parent = null;
  }
  if (draftMesh) {
    draftMesh.dispose();
    draftMesh = null;
  }
  const d = store.draft;
  if (d.closed && d.points.length >= 3) {
    draftMesh = buildShapeMesh('draft', d, DRAFT_COLOR);
    draftMesh.metadata.id = 'draft';
    positionDraft();
    // 草稿积木也可以拖动位置
    const drag = new PointerDragBehavior({ dragPlaneNormal: new Vector3(0, 1, 0) });
    drag.onDragObservable.add(() => {
      checkOverlaps();
    });
    drag.onDragEndObservable.add(() => {
      store.draftPos.x = draftMesh.position.x - (d.revolve ? d.axisX : 0);
      store.draftPos.z = draftMesh.position.z;
    });
    draftMesh.addBehavior(drag);
  }
  updateHelpers();
  checkOverlaps();
}

function updateHelpers() {
  const d = store.draft;
  const show = d.closed && d.points.length >= 3 && draftMesh;
  extrudeHandle.isVisible = !!(show && !d.revolve);
  angleHandle.isVisible = !!(show && d.revolve);
  axisMarker.isVisible = !!(show && d.revolve);
  if (!show) return;
  extrudeHandle.parent = draftMesh;
  angleHandle.parent = draftMesh;
  axisMarker.parent = draftMesh;
  if (d.revolve) {
    // 回转体网格原点在轴线上
    angleHandle.position.set(2.2, 0.9, 0);
    axisMarker.position.set(0, 0.02, 0);
  } else {
    const b = bbox(d.points);
    extrudeHandle.position.set(
      (b.minX + b.maxX) / 2,
      d.thickness + 0.9,
      (b.minY + b.maxY) / 2
    );
  }
}

// ---------- 复制的积木 ----------
function syncCopies() {
  for (const [id, m] of copyMeshes) {
    if (!store.blocks.find((b) => b.id === id)) {
      m.dispose();
      copyMeshes.delete(id);
    }
  }
  for (const b of store.blocks) {
    let m = copyMeshes.get(b.id);
    if (!m) {
      m = buildShapeMesh(b.id, b.shape, b.color);
      m.metadata.id = b.id;
      const drag = new PointerDragBehavior({ dragPlaneNormal: new Vector3(0, 1, 0) });
      drag.onDragStartObservable.add(() => {
        m.metadata.dragging = true;
      });
      drag.onDragObservable.add(() => {
        checkOverlaps();
      });
      drag.onDragEndObservable.add(() => {
        b.x = m.position.x;
        b.z = m.position.z;
        m.metadata.dragging = false;
        checkOverlaps();
      });
      m.addBehavior(drag);
      copyMeshes.set(b.id, m);
    }
    if (!m.metadata.dragging) {
      m.position.x = b.x;
      m.position.z = b.z;
    }
  }
  checkOverlaps();
}

// ---------- 穿模检测 ----------
function boxesOverlap(m1, m2) {
  const a = m1.getBoundingInfo().boundingBox;
  const b = m2.getBoundingInfo().boundingBox;
  const e = 0.03;
  return (
    a.minimumWorld.x + e < b.maximumWorld.x &&
    a.maximumWorld.x - e > b.minimumWorld.x &&
    a.minimumWorld.y + e < b.maximumWorld.y &&
    a.maximumWorld.y - e > b.minimumWorld.y &&
    a.minimumWorld.z + e < b.maximumWorld.z &&
    a.maximumWorld.z - e > b.minimumWorld.z
  );
}

function checkOverlaps() {
  const all = [];
  if (draftMesh) all.push(draftMesh);
  for (const m of copyMeshes.values()) all.push(m);
  for (const m of all) m.metadata.overlap = false;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (boxesOverlap(all[i], all[j])) {
        all[i].metadata.overlap = true;
        all[j].metadata.overlap = true;
      }
    }
  }
  refreshOutlines();
}

function refreshOutlines() {
  const entries = [];
  if (draftMesh) entries.push(draftMesh);
  for (const m of copyMeshes.values()) entries.push(m);
  let any = false;
  for (const m of entries) {
    const ov = !!m.metadata.overlap;
    any = any || ov;
    // 穿模 → 红色轮廓提示
    m.renderOutline = ov;
    m.outlineColor = Color3.Red();
    m.outlineWidth = 0.12;
    // 选中 → 微微发光
    const base = Color3.FromHexString(m.metadata.baseColor || '#ffffff');
    m.material.emissiveColor =
      store.selectedId === m.metadata.id && !ov ? base.scale(0.4) : Color3.Black();
  }
  store.hasOverlap = any;
}

// ---------- 视角 ----------
function animateCam(prop, to) {
  const ease = new CubicEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
  Animation.CreateAndStartAnimation('cam-' + prop, camera, prop, 60, 40, camera[prop], to, 0, ease);
}

function setView(v) {
  const views = {
    front: [-Math.PI / 2, 1.25, 17],
    top: [-Math.PI / 2, 0.03, 19],
    orbit: [-Math.PI / 2.4, 1.02, 16],
  };
  const [a, b, r] = views[v] || views.orbit;
  animateCam('alpha', a);
  animateCam('beta', b);
  animateCam('radius', r);
}

// ---------- 导出图片 ----------
async function exportImage() {
  const vis = [extrudeHandle.isVisible, angleHandle.isVisible, axisMarker.isVisible];
  extrudeHandle.isVisible = false;
  angleHandle.isVisible = false;
  axisMarker.isVisible = false;
  try {
    const data = await Tools.CreateScreenshotAsync(engine, camera, { width: 1600, height: 1000 });
    const a = document.createElement('a');
    a.href = data;
    a.download = '我的积木作品.png';
    a.click();
  } finally {
    extrudeHandle.isVisible = vis[0];
    angleHandle.isVisible = vis[1];
    axisMarker.isVisible = vis[2];
  }
}

// ---------- 初始化 ----------
onMounted(() => {
  const canvas = canvasRef.value;
  engine = new Engine(canvas, true, { stencil: true });
  scene = new Scene(engine);
  scene.clearColor = new Color4(0.94, 0.96, 1, 1);

  camera = new ArcRotateCamera('cam', -Math.PI / 2.4, 1.02, 16, new Vector3(0, 1, 0), scene);
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 4;
  camera.panningSensibility = 0; // 给孩子用,关掉平移
  camera.lowerRadiusLimit = 6;
  camera.upperRadiusLimit = 40;
  camera.lowerBetaLimit = 0.02;
  camera.upperBetaLimit = 1.54;

  const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.95;
  const dir = new DirectionalLight('dir', new Vector3(-0.4, -1, -0.35), scene);
  dir.intensity = 0.5;

  // 地面网格
  const ground = MeshBuilder.CreateGround('ground', { width: 80, height: 80 }, scene);
  const grid = new GridMaterial('grid', scene);
  grid.majorUnitFrequency = 5;
  grid.minorUnitVisibility = 0.4;
  grid.gridRatio = 1;
  grid.mainColor = new Color3(0.93, 0.95, 0.99);
  grid.lineColor = new Color3(0.74, 0.8, 0.9);
  grid.backFaceCulling = false;
  ground.material = grid;
  ground.position.y = -0.02;
  ground.metadata = { id: null };

  // 拉伸手柄(黄色小球):上下拖动改变厚度
  extrudeHandle = MeshBuilder.CreateSphere('extrudeHandle', { diameter: 0.8 }, scene);
  const ehMat = new StandardMaterial('eh-mat', scene);
  ehMat.diffuseColor = Color3.FromHexString('#ffb300');
  ehMat.emissiveColor = Color3.FromHexString('#8f6600');
  extrudeHandle.material = ehMat;
  extrudeHandle.isVisible = false;
  extrudeHandle.metadata = { id: 'helper' };
  const ehDrag = new PointerDragBehavior({ dragAxis: new Vector3(0, 1, 0) });
  ehDrag.onDragStartObservable.add(() => {
    dragStartThickness = store.draft.thickness;
  });
  ehDrag.onDragObservable.add((e) => {
    const t = Math.min(8, Math.max(0.2, dragStartThickness + e.dragDistance));
    store.draft.thickness = Math.round(t * 10) / 10;
  });
  extrudeHandle.addBehavior(ehDrag);

  // 角度手柄(绿色小球):左右拖动,15° 一档
  angleHandle = MeshBuilder.CreateSphere('angleHandle', { diameter: 0.8 }, scene);
  const ahMat = new StandardMaterial('ah-mat', scene);
  ahMat.diffuseColor = Color3.FromHexString('#66bb6a');
  ahMat.emissiveColor = Color3.FromHexString('#2e5d31');
  angleHandle.material = ahMat;
  angleHandle.isVisible = false;
  angleHandle.metadata = { id: 'helper' };
  const ahDrag = new PointerDragBehavior({ dragAxis: new Vector3(1, 0, 0) });
  ahDrag.onDragStartObservable.add(() => {
    dragStartAngle = store.draft.angle;
  });
  ahDrag.onDragObservable.add((e) => {
    const raw = dragStartAngle + e.dragDistance * 60;
    store.draft.angle = Math.min(360, Math.max(15, Math.round(raw / 15) * 15));
  });
  angleHandle.addBehavior(ahDrag);

  // 旋转轴地面标记
  axisMarker = MeshBuilder.CreateBox('axisMarker', { width: 0.1, height: 0.04, depth: 16 }, scene);
  const axMat = new StandardMaterial('ax-mat', scene);
  axMat.diffuseColor = Color3.FromHexString('#e05563');
  axMat.emissiveColor = Color3.FromHexString('#7a2a32');
  axisMarker.material = axMat;
  axisMarker.isVisible = false;
  axisMarker.metadata = { id: 'helper' };
  axisMarker.isPickable = false;

  // 点选积木
  scene.onPointerObservable.add((pi) => {
    if (pi.type !== PointerEventTypes.POINTERDOWN) return;
    const picked = pi.pickInfo?.pickedMesh;
    const id = picked?.metadata?.id;
    if (id && id !== 'helper') {
      store.selectedId = id;
    } else if (!id) {
      store.selectedId = null;
    }
  });

  // 数据 → 场景
  watch(() => store.draft, rebuildDraft, { deep: true });
  watch(() => store.blocks, syncCopies, { deep: true });
  watch(() => store.selectedId, refreshOutlines);
  rebuildDraft();
  syncCopies();

  engine.runRenderLoop(() => scene.render());

  resizeObserver = new ResizeObserver(() => engine.resize());
  resizeObserver.observe(canvas.parentElement);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  engine?.dispose();
});
</script>

<style scoped>
.vp-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.vp-canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
  touch-action: none;
}

.vp-badge {
  position: absolute;
  top: 14px;
  left: 14px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  padding: 6px 16px;
  font-size: 15px;
  font-weight: 700;
  color: #1565c0;
  box-shadow: 0 2px 10px rgba(60, 80, 140, 0.18);
  pointer-events: none;
}

.vp-warn {
  position: absolute;
  top: 14px;
  right: 14px;
  background: #ffebee;
  border: 2px solid #ef5350;
  color: #c62828;
  border-radius: 999px;
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 700;
  pointer-events: none;
}
</style>
