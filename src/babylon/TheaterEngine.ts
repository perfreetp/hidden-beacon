import {
  Color3,
  Color4,
  DirectionalLight,
  PointLight,
  HemisphericLight,
  Vector3,
  Matrix,
  Quaternion,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  CascadedShadowGenerator,
  ShadowGenerator,
  TransformNode,
  ArcRotateCamera,
  Scene,
  Engine,
  Plane,
  PointerEventTypes,
  PointerInfo,
  type AbstractMesh,
  GlowLayer,
} from '@babylonjs/core';
import type { DraggableKind, LightSettings, ObjectPlacement, ShadowSettings, Theater } from '../types';
import { kelvinToRgb } from '../lib/colorTemperature';
import { createFloor, createObject } from './meshFactory';
import { DebugDepthMonitor } from './DebugDepthMonitor';

/** 引擎向 UI 层发出的事件 */
export interface EngineCallbacks {
  /** 某个物体被拖动结束，返回新的摆放（旋转、台灯高度） */
  onPlacementCommitted: (placement: ObjectPlacement) => void;
  /** 选中物体变化，null 表示取消选中 */
  onSelectionChange: (id: string | null) => void;
  /** 画面持续偏暗时触发一次，恢复后可以再次触发 */
  onDarkScene: (dark: boolean) => void;
}

interface ObjectEntry {
  root: TransformNode;
  placement: ObjectPlacement;
  kind: DraggableKind;
}

const FLOOR_HALF = 11.5;
const CASCADE_COLORS = [
  new Color3(1, 0.35, 0.35),
  new Color3(0.35, 1, 0.5),
  new Color3(0.4, 0.6, 1),
];
const PCF_QUALITY = [
  ShadowGenerator.QUALITY_LOW,
  ShadowGenerator.QUALITY_MEDIUM,
  ShadowGenerator.QUALITY_HIGH,
];

export class TheaterEngine {
  private canvas: HTMLCanvasElement;
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private sun: DirectionalLight;
  private lamp: PointLight;
  private csm!: CascadedShadowGenerator;
  private lampShadow!: ShadowGenerator;
  private glow: GlowLayer;
  private entries = new Map<string, ObjectEntry>();
  private floor!: Mesh;
  private selectionRing!: Mesh;
  private frustumLines: Mesh[] = [];
  private monitor: DebugDepthMonitor | null = null;
  private monitorCanvases: HTMLCanvasElement[] = [];
  private cb: EngineCallbacks;
  private disposed = false;

  // 拖拽状态
  private dragId: string | null = null;
  private dragPlane: Plane | null = null;

  // 偏暗检测
  private darkFrames = 0;
  private darkNotified = false;
  private frameCount = 0;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.96, 0.93, 0.88, 1);
    // 环境光只做轻微补光，避免与主灯叠加导致整体过曝发白
    this.scene.ambientColor = new Color3(0.12, 0.12, 0.14);
    this.scene.imageProcessingConfiguration.exposure = 0.95;
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.imageProcessingConfiguration.toneMappingType = 1; // REINHARD 柔和压高光
    this.scene.imageProcessingConfiguration.contrast = 1.15;
    this.scene.imageProcessingConfiguration.vignetteEnabled = true;
    this.scene.imageProcessingConfiguration.vignetteWeight = 1.5;
    this.scene.imageProcessingConfiguration.vignetteStretch = 0.6;

    this.camera = new ArcRotateCamera('cam', -Math.PI / 2.4, Math.PI / 3.1, 14, new Vector3(0, 0.6, 0), this.scene);
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 7;
    this.camera.upperRadiusLimit = 26;
    this.camera.lowerBetaLimit = 0.35;
    this.camera.upperBetaLimit = Math.PI / 2.05;
    this.camera.wheelDeltaPercentage = 0.012;
    this.camera.pinchDeltaPercentage = 0.012;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 120;

    // 环境光保证阴影外不会死黑，但保持低强度防止冲淡阴影
    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.2), this.scene);
    hemi.intensity = 0.28;
    hemi.groundColor = new Color3(0.5, 0.46, 0.42);

    // 窗口日光：方向光
    this.sun = new DirectionalLight('sun', new Vector3(-1, -1.6, -0.6), this.scene);
    this.sun.position = new Vector3(8, 12, 8);

    // 台灯：点光源
    this.lamp = new PointLight('lamp', new Vector3(2.8, 2.6, 2.6), this.scene);
    this.lamp.range = 14;

    this.glow = new GlowLayer('glow', this.scene);
    this.glow.intensity = 0.35;

    this.buildShadowGenerators({
      mapSize: 1024,
      splitLambda: 0.5,
      shadowMaxZ: 24,
      pcfKernel: 1,
    });

    this.floor = createFloor(this.scene);
    this.buildSelectionRing();
    this.bindPointer();

    this.scene.onBeforeRenderObservable.add(() => this.tick());
    this.engine.runRenderLoop(() => {
      if (!this.disposed) this.scene.render();
    });
    window.addEventListener('resize', this.handleResize);
  }

  // ------------------------------------------------------------- 阴影生成器

  private buildShadowGenerators(shadow: ShadowSettings): void {
    this.csm?.dispose();
    this.lampShadow?.dispose();

    // 日光：三级级联，每级独立深度图，近级分辨率利用更充分
    this.csm = new CascadedShadowGenerator(shadow.mapSize, this.sun);
    this.csm.numCascades = 3;
    this.csm.lambda = shadow.splitLambda;
    this.csm.shadowMaxZ = shadow.shadowMaxZ;
    this.csm.usePercentageCloserFiltering = true;
    this.csm.filteringQuality = PCF_QUALITY[shadow.pcfKernel] ?? ShadowGenerator.QUALITY_MEDIUM;
    this.csm.bias = 0.012;
    this.csm.normalBias = 0.03;
    this.csm.cascadeBlendPercentage = 0.12;
    this.csm.depthClamp = true;
    this.csm.darkness = 0.32;

    // 台灯：立方体点光源阴影，同样走 PCF
    this.lampShadow = new ShadowGenerator(shadow.mapSize, this.lamp);
    this.lampShadow.usePercentageCloserFiltering = true;
    this.lampShadow.filteringQuality = PCF_QUALITY[shadow.pcfKernel] ?? ShadowGenerator.QUALITY_MEDIUM;
    this.lampShadow.bias = 0.015;
    this.lampShadow.normalBias = 0.04;
    this.lampShadow.darkness = 0.35;

    // 已存在的投射物体重新登记
    for (const entry of this.entries.values()) {
      this.addCaster(entry.root);
    }
    // 调试监视器重新绑定新的深度纹理数组
    if (this.monitor) this.monitor.rebind(this.csm);
  }

  private addCaster(root: TransformNode): void {
    for (const m of root.getChildMeshes()) {
      this.csm.addShadowCaster(m);
      this.lampShadow.addShadowCaster(m);
    }
  }

  // ------------------------------------------------------------- 场景物体

  private buildSelectionRing(): void {
    this.selectionRing = MeshBuilder.CreateTorus(
      'selection-ring',
      { diameter: 1.9, thickness: 0.06, tessellation: 48 },
      this.scene,
    );
    const mat = new StandardMaterial('ring-mat', this.scene);
    mat.emissiveColor = new Color3(1, 0.72, 0.2);
    mat.diffuseColor = new Color3(0.2, 0.15, 0.05);
    this.selectionRing.material = mat;
    this.selectionRing.rotation.x = Math.PI / 2;
    this.selectionRing.position.y = 0.04;
    this.selectionRing.isVisible = false;
  }

  /** 整体切换剧场：清空并重建所有摆放 */
  applyTheater(theater: Theater): void {
    for (const entry of this.entries.values()) {
      entry.root.dispose(false, true);
    }
    this.entries.clear();
    this.dragId = null;
    this.selectedId = null;
    this.selectionRing.isVisible = false;
    this.cb.onSelectionChange(null);

    for (const p of theater.placements) {
      const root = createObject(this.scene, p.kind, p.id);
      root.position.set(p.x, 0, p.z);
      root.rotation.y = p.rotationY;
      this.entries.set(p.id, { root, placement: { ...p }, kind: p.kind });
      this.addCaster(root);
    }

    this.applySunDirection(theater.sunAzimuth, theater.sunElevation);
    this.applyLight('sun', theater.sun);
    this.applyLight('lamp', theater.lamp);
    this.applyShadow(theater.shadow);
    this.placeLamp(theater.placements.find((p) => p.kind === 'lamp') ?? null);
  }

  /** 仅更新一个摆放（拖拽/旋转/高度滑块后）；无变化时跳过，避免拖拽回写造成冗余写入 */
  updatePlacement(placement: ObjectPlacement): void {
    const entry = this.entries.get(placement.id);
    if (!entry) return;
    const prev = entry.placement;
    const same =
      prev.x === placement.x &&
      prev.z === placement.z &&
      prev.rotationY === placement.rotationY &&
      (prev.y ?? 2.6) === (placement.y ?? 2.6);
    if (same) return;
    entry.placement = { ...placement };
    entry.root.position.set(placement.x, 0, placement.z);
    entry.root.rotation.y = placement.rotationY;
    if (placement.kind === 'lamp') this.placeLamp(placement);
    // 若正在选中该物体，选择环跟随
    if (this.selectedId === placement.id) {
      this.selectionRing.position.x = placement.x;
      this.selectionRing.position.z = placement.z;
    }
  }

  private placeLamp(lampPlacement: ObjectPlacement | null): void {
    if (!lampPlacement) return;
    const y = lampPlacement.y ?? 2.6;
    this.lamp.position.set(lampPlacement.x, y, lampPlacement.z);
  }

  // ------------------------------------------------------------- 灯光参数

  applyLight(which: 'sun' | 'lamp', s: LightSettings): void {
    const light = which === 'sun' ? this.sun : this.lamp;
    const rgb = kelvinToRgb(s.temperature);
    light.intensity = s.enabled ? s.intensity : 0;
    light.diffuse = new Color3(rgb.r, rgb.g, rgb.b);
    if (which === 'lamp') {
      // 灯泡自发光跟着色温与强度走
      const entry = [...this.entries.values()].find((e) => e.kind === 'lamp');
      const bulb = entry?.root.getChildMeshes().find((m) => m.metadata?.isBulb);
      if (bulb && bulb.material instanceof StandardMaterial) {
        const k = s.enabled ? Math.min(1, 0.25 + s.intensity * 0.35) : 0.05;
        bulb.material.emissiveColor = new Color3(rgb.r * k, rgb.g * k, rgb.b * k);
      }
    }
  }

  applySunDirection(azimuth: number, elevation: number): void {
    const dir = new Vector3(
      Math.cos(elevation) * Math.cos(azimuth),
      -Math.sin(elevation),
      Math.cos(elevation) * Math.sin(azimuth),
    );
    this.sun.direction = dir.normalize();
    // 方向光的 position 只影响阴影相机位置，保持在场景上方即可
    this.sun.position = this.sun.direction.scale(-12).add(new Vector3(0, 14, 0));
  }

  applyShadow(shadow: ShadowSettings): void {
    if (this.csm.mapSize !== shadow.mapSize || this.lampShadow.mapSize !== shadow.mapSize) {
      // 改贴图分辨率需要重建生成器
      this.buildShadowGenerators(shadow);
    }
    this.csm.lambda = shadow.splitLambda;
    this.csm.shadowMaxZ = shadow.shadowMaxZ;
    this.csm.filteringQuality = PCF_QUALITY[shadow.pcfKernel] ?? ShadowGenerator.QUALITY_MEDIUM;
    this.lampShadow.filteringQuality = PCF_QUALITY[shadow.pcfKernel] ?? ShadowGenerator.QUALITY_MEDIUM;
  }

  // ------------------------------------------------------------- 拾取与拖拽

  private rootIdFromPick(mesh: AbstractMesh): string | null {
    let m: AbstractMesh | null = mesh;
    while (m) {
      if (m.metadata?.rootId) return m.metadata.rootId as string;
      m = m.parent as AbstractMesh | null;
    }
    return null;
  }

  private bindPointer(): void {
    this.scene.onPointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERDOWN) {
        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m.isPickable && m !== this.floor);
        if (pick?.hit && pick.pickedMesh) {
          const id = this.rootIdFromPick(pick.pickedMesh);
          if (id) this.beginDrag(id, info);
        }
      } else if (info.type === PointerEventTypes.POINTERUP && this.dragId) {
        this.endDrag();
      } else if (info.type === PointerEventTypes.POINTERMOVE && this.dragId) {
        this.moveDrag();
      }
    });
    // 兜底：拖拽期间直接监听原生指针移动，避免 detachControl 后场景事件丢失
    this.canvas.addEventListener('pointermove', () => {
      if (this.dragId) this.moveDrag();
    });
  }

  private beginDrag(id: string, info: PointerInfo): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.dragId = id;
    this.camera.detachControl();
    this.canvas.style.cursor = 'grabbing';

    if (entry.kind === 'lamp') {
      // 台灯在水平面上拖，高度由滑块控制
      this.dragPlane = Plane.FromPositionAndNormal(new Vector3(0, entry.placement.y ?? 2.6, 0), Vector3.Up());
    } else {
      this.dragPlane = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up());
    }
    this.showSelection(id);
    this.moveDrag();
    void info;
  }

  private moveDrag(): void {
    if (!this.dragId || !this.dragPlane) return;
    const ray = this.scene.createPickingRay(this.scene.pointerX, this.scene.pointerY, Matrix.Identity(), this.camera);
    const t = ray.intersectsPlane(this.dragPlane);
    if (t === null || t === undefined) return;
    const point = ray.origin.add(ray.direction.scale(t));
    const entry = this.entries.get(this.dragId);
    if (!entry) return;
    const x = clamp(point.x, -FLOOR_HALF, FLOOR_HALF);
    const z = clamp(point.z, -FLOOR_HALF, FLOOR_HALF);
    entry.placement = { ...entry.placement, x, z };
    entry.root.position.set(x, 0, z);
    // 选中环实时跟随
    this.selectionRing.position.x = x;
    this.selectionRing.position.z = z;
    if (entry.kind === 'lamp') this.placeLamp(entry.placement);
  }

  private endDrag(): void {
    if (!this.dragId) return;
    const entry = this.entries.get(this.dragId);
    if (entry) this.cb.onPlacementCommitted({ ...entry.placement });
    this.dragId = null;
    this.dragPlane = null;
    this.camera.attachControl(this.canvas, true);
    this.canvas.style.cursor = 'default';
  }

  private selectedId: string | null = null;

  private showSelection(id: string | null): void {
    this.cb.onSelectionChange(id);
    this.selectedId = id;
    if (!id) {
      this.selectionRing.isVisible = false;
      return;
    }
    const entry = this.entries.get(id);
    if (!entry) {
      this.selectionRing.isVisible = false;
      this.selectedId = null;
      return;
    }
    this.selectionRing.isVisible = true;
    this.selectionRing.position.x = entry.placement.x;
    this.selectionRing.position.z = entry.placement.z;
    const scale = entry.kind === 'house' ? 1.7 : entry.kind === 'lamp' ? 1.0 : 1.15;
    this.selectionRing.scaling.set(scale, scale, scale);
  }

  selectObject(id: string | null): void {
    if (id && !this.entries.has(id)) return;
    this.showSelection(id);
  }

  /** 旋转当前选中物体（按钮操作，孩子也能给玩具转身） */
  rotateSelected(deltaRad: number): void {
    const id = this.selectedId;
    if (!id) return;
    const entry = this.entries.get(id);
    if (!entry || entry.kind === 'lamp') return;
    entry.placement = { ...entry.placement, rotationY: entry.placement.rotationY + deltaRad };
    entry.root.rotation.y = entry.placement.rotationY;
    this.cb.onPlacementCommitted({ ...entry.placement });
  }

  /** 调整台灯高度 */
  setLampHeight(height: number): void {
    const lamp = [...this.entries.values()].find((e) => e.kind === 'lamp');
    if (!lamp) return;
    lamp.placement = { ...lamp.placement, y: clamp(height, 1.4, 5.5) };
    this.placeLamp(lamp.placement);
    this.cb.onPlacementCommitted({ ...lamp.placement });
  }

  // ------------------------------------------------------------- 调试视图

  setDebug(enabled: boolean): void {
    this.csm.debug = enabled;
    for (const line of this.frustumLines) line.dispose();
    this.frustumLines = [];
    if (enabled) {
      this.buildFrustumLines();
      if (!this.monitor) this.monitor = new DebugDepthMonitor(this.scene, this.csm);
    } else {
      this.monitor?.dispose();
      this.monitor = null;
      this.monitorCanvases = [];
    }
  }

  /** UI 层注册三个 canvas，引擎在调试模式下定期把深度图回写给它们 */
  attachDebugCanvases(canvases: HTMLCanvasElement[]): void {
    this.monitorCanvases = canvases;
  }

  get isDebug(): boolean {
    return this.monitor !== null;
  }

  private buildFrustumLines(): void {
    for (let i = 0; i < this.csm.numCascades; i++) {
      const min = this.csm.getCascadeMinExtents(i);
      const max = this.csm.getCascadeMaxExtents(i);
      if (!min || !max) continue;
      const w = max.x - min.x;
      const h = max.y - min.y;
      const d = max.z - min.z;
      const box = MeshBuilder.CreateBox(`frustum-${i}`, { width: w, height: h, depth: d, updatable: true }, this.scene);
      const mat = new StandardMaterial(`frustum-mat-${i}`, this.scene);
      mat.wireframe = true;
      mat.emissiveColor = CASCADE_COLORS[i];
      mat.disableLighting = true;
      box.material = mat;
      box.isPickable = false;
      this.frustumLines.push(box);
    }
    this.updateFrustumLines();
  }

  private updateFrustumLines(): void {
    if (this.frustumLines.length === 0) return;
    const invView = new Matrix();
    const scale = new Vector3();
    const rot = new Quaternion();
    const pos = new Vector3();
    for (let i = 0; i < this.frustumLines.length; i++) {
      const min = this.csm.getCascadeMinExtents(i);
      const max = this.csm.getCascadeMaxExtents(i);
      if (!min || !max) continue;
      // extents 位于该级联的光视图空间，用视图逆矩阵换回世界空间
      const viewMat = this.csm.getCascadeViewMatrix(i);
      if (!viewMat) continue;
      viewMat.invertToRef(invView);
      invView.decompose(scale, rot, pos);
      const box = this.frustumLines[i];
      box.rotationQuaternion = rot.clone();
      const centerView = min.add(max).scale(0.5);
      Vector3.TransformCoordinatesToRef(centerView, invView, box.position);
    }
  }

  // ------------------------------------------------------------- 每帧更新

  private tick(): void {
    this.frameCount++;
    this.updateFrustumLines();
    if (this.dragId) this.moveDrag();

    // 调试监视器：定期回读深度图到页面 canvas
    if (this.monitor && this.monitorCanvases.length > 0 && this.frameCount % 15 === 0) {
      this.monitorCanvases.forEach((canvas, i) => {
        this.monitor?.drawTo(canvas, i).catch(() => undefined);
      });
    }

    // 每 12 帧采样一次屏幕亮度，判断画面是否偏暗
    if (this.frameCount % 12 === 0) {
      this.sampleCount++;
      this.sampleBrightness();
    }
  }
  private sampleCount = 0;

  private sampleBrightness(): void {
    const engine = this.engine;
    const x = Math.round(engine.getRenderWidth() * 0.5);
    const y = Math.round(engine.getRenderHeight() * 0.55);
    try {
      const result = engine.readPixels(x, y, 1, 1);
      if (result instanceof Promise) {
        result.then((buf) => this.feedBrightnessSample(buf)).catch(() => undefined);
      } else if (result) {
        this.feedBrightnessSample(result);
      }
    } catch {
      /* 个别环境不支持回读就跳过，不影响主流程 */
    }
  }

  private feedBrightnessSample(buf: ArrayBufferView): void {
    const b = buf as Uint8Array;
    if (b.length < 4) return;
    // readPixels 返回 RGBA，屏幕坐标原点在左下
    const luma = (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) / 255;
    if (luma < 0.16) {
      this.darkFrames++;
    } else {
      this.darkFrames = Math.max(0, this.darkFrames - 2);
    }
    // 连续 3 次采样偏暗即提示（正常帧率约 0.6s），恢复明亮后自动复位
    if (this.darkFrames >= 3 && !this.darkNotified) {
      this.darkNotified = true;
      this.cb.onDarkScene(true);
    } else if (this.darkFrames === 0 && this.darkNotified) {
      this.darkNotified = false;
      this.cb.onDarkScene(false);
    }
  }

  // ------------------------------------------------------------- 生命周期

  private handleResize = (): void => {
    this.engine.resize();
  };

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    this.monitor?.dispose();
    this.monitor = null;
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
