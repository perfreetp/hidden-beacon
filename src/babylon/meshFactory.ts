import {
  Color3,
  StandardMaterial,
  Mesh,
  MeshBuilder,
  TransformNode,
  type Scene,
} from '@babylonjs/core';
import type { DraggableKind } from '../types';

/** 毛绒感材质：低反光、柔和漫反射 */
function plush(scene: Scene, name: string, color: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.08, 0.08, 0.08);
  m.roughness = 0.95;
  return m;
}

function sphere(
  scene: Scene,
  name: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  mat: StandardMaterial,
  parent: TransformNode,
): Mesh {
  const m = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 16 }, scene);
  m.position.set(x, y, z);
  m.scaling.set(sx, sy, sz);
  m.material = mat;
  m.parent = parent;
  return m;
}

function box(
  scene: Scene,
  name: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  mat: StandardMaterial,
  parent: TransformNode,
): Mesh {
  const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  m.position.set(x, y, z);
  m.material = mat;
  m.parent = parent;
  return m;
}

function cylinder(
  scene: Scene,
  name: string,
  x: number,
  y: number,
  z: number,
  dTop: number,
  dBot: number,
  h: number,
  mat: StandardMaterial,
  parent: TransformNode,
): Mesh {
  const m = MeshBuilder.CreateCylinder(name, { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: 24 }, scene);
  m.position.set(x, y, z);
  m.material = mat;
  m.parent = parent;
  return m;
}

/** 地板 + 地毯，返回地板网格用于拖拽拾取 */
export function createFloor(scene: Scene): Mesh {
  const floorMat = plush(scene, 'floor-mat', new Color3(0.86, 0.75, 0.58));
  const floor = MeshBuilder.CreateGround('floor', { width: 26, height: 26, subdivisions: 2 }, scene);
  floor.material = floorMat;
  floor.receiveShadows = true;

  const rugMat = plush(scene, 'rug-mat', new Color3(0.96, 0.72, 0.64));
  const rug = MeshBuilder.CreateDisc('rug', { radius: 5.2, tessellation: 48 }, scene);
  rug.rotation.x = Math.PI / 2;
  rug.position.y = 0.012;
  rug.material = rugMat;
  rug.receiveShadows = true;
  return floor;
}

/** 小屋 */
function buildHouse(scene: Scene, root: TransformNode): void {
  const wall = plush(scene, 'house-wall', new Color3(0.93, 0.86, 0.72));
  const roofMat = plush(scene, 'house-roof', new Color3(0.78, 0.38, 0.32));
  const dark = plush(scene, 'house-dark', new Color3(0.42, 0.28, 0.2));
  const glow = new StandardMaterial('house-window-glow', scene);
  glow.emissiveColor = new Color3(1.0, 0.78, 0.42);
  glow.diffuseColor = new Color3(0.2, 0.15, 0.1);

  box(scene, 'house-body', 0, 0.9, 0, 2.2, 1.8, 1.8, wall, root);
  const roof = MeshBuilder.CreateCylinder('house-roof-m', { diameterTop: 0.15, diameterBottom: 2.7, height: 1.2, tessellation: 4 }, scene);
  roof.position.set(0, 2.35, 0);
  roof.rotation.y = Math.PI / 4;
  roof.material = roofMat;
  roof.parent = root;
  box(scene, 'house-door', 0, 0.55, 0.91, 0.6, 1.1, 0.06, dark, root);
  box(scene, 'house-window', -0.65, 1.15, 0.92, 0.42, 0.42, 0.05, glow, root);
  box(scene, 'house-window2', 0.65, 1.15, 0.92, 0.42, 0.42, 0.05, glow, root);
}

/** 兔子 */
function buildBunny(scene: Scene, root: TransformNode): void {
  const fur = plush(scene, 'bunny-fur', new Color3(0.96, 0.92, 0.9));
  const pink = plush(scene, 'bunny-pink', new Color3(0.98, 0.72, 0.75));
  sphere(scene, 'bunny-body', 0, 0.55, 0, 0.85, 0.95, 0.75, fur, root);
  sphere(scene, 'bunny-head', 0, 1.25, 0.05, 0.62, 0.6, 0.58, fur, root);
  sphere(scene, 'bunny-ear-l', -0.18, 1.85, 0.02, 0.18, 0.62, 0.13, fur, root);
  sphere(scene, 'bunny-ear-r', 0.18, 1.85, 0.02, 0.18, 0.62, 0.13, fur, root);
  sphere(scene, 'bunny-inner-l', -0.18, 1.85, 0.1, 0.09, 0.42, 0.05, pink, root);
  sphere(scene, 'bunny-inner-r', 0.18, 1.85, 0.1, 0.09, 0.42, 0.05, pink, root);
  sphere(scene, 'bunny-tail', 0, 0.5, -0.42, 0.28, 0.28, 0.28, pink, root);
  sphere(scene, 'bunny-nose', 0, 1.2, 0.52, 0.1, 0.08, 0.08, pink, root);
}

/** 小熊 */
function buildBear(scene: Scene, root: TransformNode): void {
  const fur = plush(scene, 'bear-fur', new Color3(0.62, 0.42, 0.28));
  const cream = plush(scene, 'bear-cream', new Color3(0.9, 0.78, 0.6));
  sphere(scene, 'bear-body', 0, 0.55, 0, 0.9, 0.95, 0.8, fur, root);
  sphere(scene, 'bear-belly', 0, 0.5, 0.32, 0.5, 0.55, 0.12, cream, root);
  sphere(scene, 'bear-head', 0, 1.3, 0.05, 0.66, 0.62, 0.6, fur, root);
  sphere(scene, 'bear-ear-l', -0.36, 1.72, 0.02, 0.26, 0.26, 0.2, fur, root);
  sphere(scene, 'bear-ear-r', 0.36, 1.72, 0.02, 0.26, 0.26, 0.2, fur, root);
  sphere(scene, 'bear-snout', 0, 1.18, 0.48, 0.3, 0.22, 0.2, cream, root);
  sphere(scene, 'bear-nose', 0, 1.22, 0.64, 0.1, 0.08, 0.07, fur, root);
}

/** 小鸭 */
function buildDuck(scene: Scene, root: TransformNode): void {
  const yellow = plush(scene, 'duck-fur', new Color3(1.0, 0.82, 0.28));
  const orange = plush(scene, 'duck-orange', new Color3(0.98, 0.55, 0.18));
  sphere(scene, 'duck-body', 0, 0.45, 0, 0.9, 0.75, 0.75, yellow, root);
  sphere(scene, 'duck-head', 0, 1.05, 0.12, 0.48, 0.48, 0.46, yellow, root);
  const beak = MeshBuilder.CreateCylinder('duck-beak', { diameterTop: 0.08, diameterBottom: 0.22, height: 0.35, tessellation: 16 }, scene);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 1.02, 0.52);
  beak.material = orange;
  beak.parent = root;
  sphere(scene, 'duck-wing-l', -0.55, 0.5, 0, 0.25, 0.4, 0.4, yellow, root);
  sphere(scene, 'duck-wing-r', 0.55, 0.5, 0, 0.25, 0.4, 0.4, yellow, root);
}

/** 台灯（含发光灯泡网格，真实点光源由引擎挂载） */
function buildLamp(scene: Scene, root: TransformNode): void {
  const metal = plush(scene, 'lamp-metal', new Color3(0.35, 0.38, 0.45));
  const shadeMat = plush(scene, 'lamp-shade', new Color3(0.98, 0.85, 0.6));
  const bulbMat = new StandardMaterial('lamp-bulb', scene);
  bulbMat.emissiveColor = new Color3(1, 0.72, 0.35);
  bulbMat.diffuseColor = new Color3(0.3, 0.2, 0.1);

  cylinder(scene, 'lamp-base', 0, 0.06, 0, 0.7, 0.8, 0.12, metal, root);
  cylinder(scene, 'lamp-pole', 0, 1.1, 0, 0.09, 0.09, 2.1, metal, root);
  const shade = MeshBuilder.CreateCylinder('lamp-shade-m', { diameterTop: 0.5, diameterBottom: 1.05, height: 0.7, tessellation: 32 }, scene);
  shade.position.set(0, 2.25, 0);
  shade.material = shadeMat;
  shade.parent = root;
  const bulb = MeshBuilder.CreateSphere('lamp-bulb-m', { diameter: 0.34, segments: 16 }, scene);
  bulb.position.set(0, 1.95, 0);
  bulb.material = bulbMat;
  bulb.parent = root;
  bulb.metadata = { isBulb: true };
}

const builders: Record<DraggableKind, (scene: Scene, root: TransformNode) => void> = {
  house: buildHouse,
  bunny: buildBunny,
  bear: buildBear,
  duck: buildDuck,
  lamp: buildLamp,
};

/**
 * 按种类创建一个可拖拽物体，根节点是 TransformNode，
 * 所有子网格的 metadata.rootId 指向 placement id，供拾取识别。
 */
export function createObject(scene: Scene, kind: DraggableKind, id: string): TransformNode {
  const root = new TransformNode(`root-${id}`, scene);
  builders[kind](scene, root);
  for (const m of root.getChildMeshes()) {
    m.metadata = { ...(m.metadata ?? {}), rootId: id };
  }
  return root;
}
