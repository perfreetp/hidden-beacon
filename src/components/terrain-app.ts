import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { terrainHeight, terrainGradient, valleyCenter } from '../core/heightfield';
import { toLatLon, slopeAspect, aspectLabel } from '../core/geoutils';
import { createTerrainMaterial, FOG_COLOR } from '../core/terrainMaterial';
import { TileManager, TileRec } from '../core/tileManager';
import { tileToOBJ, tileToHeightCanvas, downloadBlob, safeId } from '../core/exporter';
import './terrain-hud';
import './terrain-toolbar';
import './terrain-inspector';
import './tile-monitor';
import type { TerrainHud } from './terrain-hud';
import type { TerrainInspector } from './terrain-inspector';
import type { TileMonitor } from './tile-monitor';

const LOD0_MAX_ALT = 350;

export class TerrainApp extends HTMLElement {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private material!: THREE.ShaderMaterial;
  private tm!: TileManager;
  private hud!: TerrainHud;
  private inspector!: TerrainInspector;
  private monitor!: TileMonitor;
  private boxDiv!: HTMLDivElement;
  private glHost!: HTMLDivElement;

  private raycaster = new THREE.Raycaster();
  private marker: THREE.Group | null = null;
  private regionLine: THREE.LineLoop | null = null;
  private selectedTileKey: string | null = null;
  private lastHudUpdate = 0;

  // 指针状态
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private boxSelecting = false;

  connectedCallback(): void {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; }
        #gl { position: absolute; inset: 0; }
        #gl canvas { display: block; }
        #box {
          position: absolute; display: none; pointer-events: none;
          border: 1px dashed #ffcf5a; background: rgba(255, 207, 90, 0.12);
        }
        #hint {
          position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
          font-family: "Cascadia Mono", Consolas, monospace; font-size: 11px;
          color: rgba(223, 232, 245, 0.65); background: rgba(10, 14, 20, 0.45);
          padding: 4px 12px; border-radius: 6px; pointer-events: none; white-space: nowrap;
        }
      </style>
      <div id="gl"></div>
      <terrain-hud></terrain-hud>
      <terrain-toolbar></terrain-toolbar>
      <terrain-inspector></terrain-inspector>
      <tile-monitor></tile-monitor>
      <div id="box"></div>
      <div id="hint">左键拖拽旋转 · 滚轮推近拉远 · 右键平移 · 点击坡面拾取 · Shift+拖拽框选</div>
    `;
    this.glHost = root.getElementById('gl') as HTMLDivElement;
    this.boxDiv = root.getElementById('box') as HTMLDivElement;
    this.hud = root.querySelector('terrain-hud') as TerrainHud;
    this.inspector = root.querySelector('terrain-inspector') as TerrainInspector;
    this.monitor = root.querySelector('tile-monitor') as TileMonitor;

    this.initThree();
    this.initEvents();
    this.tick();
  }

  private initThree(): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.glHost.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = FOG_COLOR.clone();

    this.camera = new THREE.PerspectiveCamera(60, 1, 1, 20000);

    // 出生点:山谷里,沿谷底朝下游看
    const sx = -450, sz = valleyCenter(-450);
    const tx = 250, tz = valleyCenter(250);
    this.camera.position.set(sx, terrainHeight(sx, sz) + 140, sz);
    const target = new THREE.Vector3(tx, terrainHeight(tx, tz) + 10, tz);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 6000;
    this.controls.update();

    this.material = createTerrainMaterial();
    this.tm = new TileManager(this.scene, this.material);
    this.tm.onLoad = (e) => this.monitor.add(e.id, e.ms, e.slow);

    this.onResize();
    window.addEventListener('resize', () => this.onResize());
  }

  private initEvents(): void {
    // 工具栏命令
    this.shadowRoot!.addEventListener('terrain-cmd', (e) => {
      const { cmd, on, value } = (e as CustomEvent).detail;
      switch (cmd) {
        case 'wireframe': this.material.wireframe = on; break;
        case 'normals': this.material.uniforms.uNormalShading.value = on ? 1 : 0; break;
        case 'contours': this.material.uniforms.uContours.value = on ? 1 : 0; break;
        case 'interval': this.material.uniforms.uContourInterval.value = value; break;
        case 'export-obj': this.exportTile('obj'); break;
        case 'export-height': this.exportTile('png'); break;
      }
    });

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (ev) => {
      this.downX = ev.clientX; this.downY = ev.clientY;
      this.downTime = performance.now();
      if (ev.shiftKey && ev.button === 0) {
        // Shift+拖拽:框选,接管指针
        this.boxSelecting = true;
        this.controls.enabled = false;
        el.setPointerCapture(ev.pointerId);
        this.placeBox(ev, ev);
        this.boxDiv.style.display = 'block';
        ev.stopPropagation();
      }
    }, true);
    el.addEventListener('pointermove', (ev) => {
      if (this.boxSelecting) {
        this.placeBox(
          { clientX: this.downX, clientY: this.downY } as MouseEvent, ev);
      }
    });
    el.addEventListener('pointerup', (ev) => {
      if (this.boxSelecting) {
        this.boxSelecting = false;
        this.controls.enabled = true;
        this.boxDiv.style.display = 'none';
        this.finishBoxSelect(ev);
        return;
      }
      const moved = Math.hypot(ev.clientX - this.downX, ev.clientY - this.downY);
      if (moved < 5 && performance.now() - this.downTime < 400 && ev.button === 0) {
        this.pick(ev);
      }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private placeBox(start: MouseEvent, cur: PointerEvent): void {
    const rect = this.glHost.getBoundingClientRect();
    const x0 = Math.min(start.clientX, cur.clientX) - rect.left;
    const y0 = Math.min(start.clientY, cur.clientY) - rect.top;
    const w = Math.abs(cur.clientX - start.clientX);
    const h = Math.abs(cur.clientY - start.clientY);
    this.boxDiv.style.left = `${x0}px`;
    this.boxDiv.style.top = `${y0}px`;
    this.boxDiv.style.width = `${w}px`;
    this.boxDiv.style.height = `${h}px`;
  }

  private ndc(ev: { clientX: number; clientY: number }): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  /** 点击拾取:经纬度、高程、坡度、坡向 + 贴法线标记 */
  private pick(ev: PointerEvent): void {
    this.raycaster.setFromCamera(this.ndc(ev), this.camera);
    const meshes: THREE.Object3D[] = [];
    this.tm.collectVisibleMeshes(meshes);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return;
    const p = hits[0].point;
    this.selectedTileKey = hits[0].object.userData.key as string;

    const { lat, lon } = toLatLon(p.x, p.z);
    const { slopeDeg, aspectDeg } = slopeAspect(p.x, p.z);
    const g = terrainGradient(p.x, p.z);
    const normal = new THREE.Vector3(-g.dx, 1, -g.dz).normalize();

    this.placeMarker(p, normal);
    this.inspector.setPick(
      `<span class="t">拾取点</span> [瓦片 ${this.selectedTileKey}]<br>` +
      `经纬度 ${lat.toFixed(6)}°N, ${lon.toFixed(6)}°E<br>` +
      `高程 ${p.y.toFixed(1)} m<br>` +
      `坡度 ${slopeDeg.toFixed(1)}° · 坡向 ${aspectLabel(aspectDeg)}` +
      (aspectDeg === null ? '' : ` (${aspectDeg.toFixed(0)}°)`)
    );
  }

  private placeMarker(point: THREE.Vector3, normal: THREE.Vector3): void {
    if (this.marker) {
      this.scene.remove(this.marker);
      this.marker.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    }
    const group = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(3, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xff5040 })
    );
    cone.position.y = 8;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5, 0.6, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd040 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.6;
    group.add(cone, ring);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    group.position.copy(point);
    this.marker = group;
    this.scene.add(group);
  }

  /** 框选:四角反投影到地形,算水平距离与最大高差 */
  private finishBoxSelect(ev: PointerEvent): void {
    const x0 = { clientX: this.downX, clientY: this.downY };
    const corners = [
      { clientX: x0.clientX, clientY: x0.clientY },
      { clientX: ev.clientX, clientY: x0.clientY },
      { clientX: ev.clientX, clientY: ev.clientY },
      { clientX: x0.clientX, clientY: ev.clientY },
    ];
    const pts: THREE.Vector3[] = [];
    for (const c of corners) {
      this.raycaster.setFromCamera(this.ndc(c), this.camera);
      const hit = this.marchTerrain(this.raycaster.ray.origin, this.raycaster.ray.direction);
      if (hit) pts.push(hit);
    }
    if (pts.length < 2) {
      this.inspector.setBox('<span class="msg">框选区域未命中地形</span>');
      return;
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    // 区域网格采样求最大高差
    const N = 24;
    let minH = Infinity, maxH = -Infinity;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const h = terrainHeight(minX + ((maxX - minX) * i) / N, minZ + ((maxZ - minZ) * j) / N);
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    const dx = maxX - minX, dz = maxZ - minZ;
    const diag = Math.hypot(dx, dz);
    this.drawRegion(minX, maxX, minZ, maxZ);
    this.inspector.setBox(
      `<span class="t">框选区域</span><br>` +
      `东西 ${dx.toFixed(0)} m × 南北 ${dz.toFixed(0)} m<br>` +
      `水平距离(对角) ${diag.toFixed(0)} m<br>` +
      `最大高差 ${(maxH - minH).toFixed(1)} m ` +
      `(${minH.toFixed(0)} ~ ${maxH.toFixed(0)} m)`
    );
  }

  /** 沿射线步进求与地形交点(二分细化) */
  private marchTerrain(origin: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 | null {
    const step = 30, maxT = 12000;
    let prevT = 0;
    for (let t = step; t <= maxT; t += step) {
      const y = origin.y + dir.y * t;
      const h = terrainHeight(origin.x + dir.x * t, origin.z + dir.z * t);
      if (y < h) {
        let a = prevT, b = t;
        for (let i = 0; i < 20; i++) {
          const m = (a + b) / 2;
          const my = origin.y + dir.y * m;
          const mh = terrainHeight(origin.x + dir.x * m, origin.z + dir.z * m);
          if (my > mh) a = m; else b = m;
        }
        return new THREE.Vector3(
          origin.x + dir.x * b, origin.y + dir.y * b, origin.z + dir.z * b);
      }
      prevT = t;
    }
    return null;
  }

  private drawRegion(minX: number, maxX: number, minZ: number, maxZ: number): void {
    if (this.regionLine) {
      this.scene.remove(this.regionLine);
      this.regionLine.geometry.dispose();
    }
    const pts: THREE.Vector3[] = [];
    const S = 40;
    const push = (x: number, z: number) =>
      pts.push(new THREE.Vector3(x, terrainHeight(x, z) + 2, z));
    for (let i = 0; i <= S; i++) push(minX + ((maxX - minX) * i) / S, minZ);
    for (let i = 0; i <= S; i++) push(maxX, minZ + ((maxZ - minZ) * i) / S);
    for (let i = 0; i <= S; i++) push(maxX - ((maxX - minX) * i) / S, maxZ);
    for (let i = 0; i <= S; i++) push(minX, maxZ - ((maxZ - minZ) * i) / S);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.regionLine = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xffcf5a }));
    this.scene.add(this.regionLine);
  }

  private exportTile(kind: 'obj' | 'png'): void {
    let rec: TileRec | undefined;
    if (this.selectedTileKey) rec = this.tm.getTile(this.selectedTileKey);
    if (!rec) rec = this.tm.tileAt(this.controls.target.x, this.controls.target.z);
    if (!rec) {
      this.inspector.message('目标瓦片未加载,请先点击坡面选取');
      return;
    }
    const id = safeId(rec.key);
    if (kind === 'obj') {
      const obj = tileToOBJ(rec);
      downloadBlob(`tile_${id}.obj`, new Blob([obj], { type: 'text/plain' }));
      this.inspector.message(`已导出 tile_${id}.obj(${rec.surfVerts} 顶点)`);
    } else {
      tileToHeightCanvas(rec).toBlob((blob) => {
        if (blob) downloadBlob(`tile_${id}_height.png`, blob);
        this.inspector.message(`已导出 tile_${id}_height.png(${rec.segs + 1}×${rec.segs + 1})`);
      }, 'image/png');
    }
  }

  private onResize(): void {
    const w = this.glHost.clientWidth || window.innerWidth;
    const h = this.glHost.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tick = (): void => {
    requestAnimationFrame(this.tick);
    this.controls.update();

    // 平移目标贴地
    const t = this.controls.target;
    t.y = terrainHeight(t.x, t.z) + 2;
    // 相机不入地
    const camGround = terrainHeight(this.camera.position.x, this.camera.position.z);
    if (this.camera.position.y < camGround + 4) this.camera.position.y = camGround + 4;
    const hAbove = this.camera.position.y - camGround;

    // 雾浓度跟随视距:看得越远雾越稀
    const viewDist = THREE.MathUtils.clamp(hAbove * 10, 900, 7000);
    this.material.uniforms.uFogDensity.value = 1.1 / viewDist;

    this.tm.update(this.camera, hAbove);
    this.renderer.render(this.scene, this.camera);

    const now = performance.now();
    if (now - this.lastHudUpdate > 200) {
      this.lastHudUpdate = now;
      this.hud.update({
        loaded: this.tm.loadedCount,
        lod0: this.tm.lodCount(0),
        lod1: this.tm.lodCount(1),
        frustumCulled: this.tm.statFrustum,
        occluded: this.tm.statOccluded,
        submitted: this.tm.statSubmitted,
        tris: this.renderer.info.render.triangles,
        camHeight: hAbove,
        lodLabel: hAbove < LOD0_MAX_ALT ? '近景 LOD0' : '远景 LOD1',
      });
    }
  };
}
customElements.define('terrain-app', TerrainApp);
