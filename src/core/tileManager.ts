import * as THREE from 'three';
import { terrainHeight } from './heightfield';

export const TILE = 256; // 每块瓦片 256m × 256m

const LOD0_SEGS = 64;   // 近景原始网格:64×64 段
const LOD1_SEGS = 32;   // 远景合并网格:2×2 瓦片合成一块,32×32 段
const LOD0_RADIUS = 3;  // 近景半径(瓦片数)
const LOD1_RADIUS = 7;  // 远景半径(合并块数)
const LOD0_MAX_ALT = 350; // 相机离地低于此高度启用近景 LOD0
const SKIRT_DEPTH = [10, 24]; // 裙边深度(米)

export interface TileRec {
  key: string;
  lod: 0 | 1;
  ix: number;
  iz: number;
  mesh: THREE.Mesh;
  tris: number;
  box: THREE.Box3;
  heights: Float32Array;
  segs: number;
  originX: number;
  originZ: number;
  size: number;
  surfVerts: number;
  surfIndices: number;
}

export interface LoadEvent {
  id: string;
  ms: number;
  slow: boolean;
}

interface Job { lod: 0 | 1; ix: number; iz: number; key: string }

export class TileManager {
  private scene: THREE.Scene;
  private material: THREE.ShaderMaterial;
  private tiles = new Map<string, TileRec>();
  private queue: Job[] = [];
  private queued = new Set<string>();
  private building = false;
  private wanted = new Set<string>();
  private frustum = new THREE.Frustum();
  private mvp = new THREE.Matrix4();
  private lastCullPos = new THREE.Vector3(1e9, 0, 0);
  private lastWantedKey = '';

  onLoad: (e: LoadEvent) => void = () => {};

  statFrustum = 0;
  statOccluded = 0;
  statSubmitted = 0;

  constructor(scene: THREE.Scene, material: THREE.ShaderMaterial) {
    this.scene = scene;
    this.material = material;
  }

  get loadedCount(): number { return this.tiles.size; }
  lodCount(lod: 0 | 1): number {
    let n = 0;
    for (const t of this.tiles.values()) if (t.lod === lod) n++;
    return n;
  }

  getTile(key: string): TileRec | undefined { return this.tiles.get(key); }

  /** 包含世界点 (x,z) 的已加载瓦片 */
  tileAt(x: number, z: number): TileRec | undefined {
    for (const t of this.tiles.values()) {
      if (x >= t.originX && x <= t.originX + t.size && z >= t.originZ && z <= t.originZ + t.size) return t;
    }
    return undefined;
  }

  collectVisibleMeshes(out: THREE.Object3D[]): void {
    for (const t of this.tiles.values()) if (t.mesh.visible) out.push(t.mesh);
  }

  update(camera: THREE.PerspectiveCamera, heightAboveGround: number): void {
    const wkey = [
      Math.floor(camera.position.x / TILE),
      Math.floor(camera.position.z / TILE),
      heightAboveGround < LOD0_MAX_ALT ? 0 : 1,
    ].join(',');
    if (wkey !== this.lastWantedKey) {
      this.lastWantedKey = wkey;
      this.computeWanted(camera, heightAboveGround);
      this.syncTiles();
    }
    void this.processQueue();
    if (camera.position.distanceToSquared(this.lastCullPos) > 9) {
      this.lastCullPos.copy(camera.position);
      this.cull(camera);
    }
  }

  /** 根据相机位置与离地高度计算需要的瓦片集合 */
  private computeWanted(cam: THREE.PerspectiveCamera, hAbove: number): void {
    this.wanted.clear();
    const ctx = Math.floor(cam.position.x / TILE);
    const ctz = Math.floor(cam.position.z / TILE);
    const csx = Math.floor(cam.position.x / (TILE * 2));
    const csz = Math.floor(cam.position.z / (TILE * 2));
    const lod0 = hAbove < LOD0_MAX_ALT;
    for (let sz = csz - LOD1_RADIUS; sz <= csz + LOD1_RADIUS; sz++) {
      for (let sx = csx - LOD1_RADIUS; sx <= csx + LOD1_RADIUS; sx++) {
        let near = false;
        if (lod0) {
          for (let dz = 0; dz < 2 && !near; dz++) {
            for (let dx = 0; dx < 2; dx++) {
              if (Math.abs(sx * 2 + dx - ctx) <= LOD0_RADIUS && Math.abs(sz * 2 + dz - ctz) <= LOD0_RADIUS) {
                near = true; break;
              }
            }
          }
        }
        if (near) {
          // 近处:原始网格(对齐到 2×2 边界,避免与合并块重叠)
          for (let dz = 0; dz < 2; dz++)
            for (let dx = 0; dx < 2; dx++)
              this.wanted.add(`0:${sx * 2 + dx}:${sz * 2 + dz}`);
        } else {
          // 远处:相邻四块合成一块低精度网格
          this.wanted.add(`1:${sx}:${sz}`);
        }
      }
    }
  }

  private syncTiles(): void {
    for (const [key, rec] of this.tiles) {
      if (!this.wanted.has(key)) {
        this.scene.remove(rec.mesh);
        rec.mesh.geometry.dispose();
        this.tiles.delete(key);
      }
    }
    for (const key of this.wanted) {
      if (!this.tiles.has(key) && !this.queued.has(key)) {
        const [l, a, b] = key.split(':');
        this.queue.push({ lod: Number(l) as 0 | 1, ix: Number(a), iz: Number(b), key });
        this.queued.add(key);
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.building) return;
    this.building = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.queued.delete(job.key);
      if (!this.wanted.has(job.key) || this.tiles.has(job.key)) continue;
      await new Promise((r) => setTimeout(r, 0)); // 让出主线程,模拟分块异步加载
      const t0 = performance.now();
      const rec = this.buildTile(job);
      const ms = performance.now() - t0;
      if (this.wanted.has(job.key)) {
        this.tiles.set(job.key, rec);
        this.scene.add(rec.mesh);
        this.lastCullPos.set(1e9, 0, 0); // 强制重新剔除
      } else {
        rec.mesh.geometry.dispose();
      }
      this.onLoad({ id: job.key, ms, slow: ms > 1500 });
    }
    this.building = false;
  }

  /** 构建单块瓦片网格(含裙边) */
  private buildTile(job: Job): TileRec {
    const lod = job.lod;
    const segs = lod === 0 ? LOD0_SEGS : LOD1_SEGS;
    const size = lod === 0 ? TILE : TILE * 2;
    const originX = job.ix * size;
    const originZ = job.iz * size;
    const n = segs + 1;
    const step = size / segs;

    const heights = new Float32Array(n * n);
    let minY = Infinity, maxY = -Infinity;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const h = terrainHeight(originX + ix * step, originZ + iz * step);
        heights[iz * n + ix] = h;
        if (h < minY) minY = h;
        if (h > maxY) maxY = h;
      }
    }

    // 裙边:沿边界一圈复制顶点并向下拉
    const perim: number[] = [];
    for (let ix = 0; ix < n; ix++) perim.push(ix);
    for (let iz = 1; iz < n; iz++) perim.push(iz * n + (n - 1));
    for (let ix = n - 2; ix >= 0; ix--) perim.push((n - 1) * n + ix);
    for (let iz = n - 2; iz >= 1; iz--) perim.push(iz * n);
    const perimCount = perim.length;
    const vCount = n * n + perimCount;

    const positions = new Float32Array(vCount * 3);
    const normals = new Float32Array(vCount * 3);

    const surfVertCount = n * n;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix;
        positions[i * 3] = originX + ix * step;
        positions[i * 3 + 1] = heights[i];
        positions[i * 3 + 2] = originZ + iz * step;
        // 由高度网格求法线(边界处用单侧差分,保证跨瓦片一致)
        const hL = heights[iz * n + Math.max(ix - 1, 0)];
        const hR = heights[iz * n + Math.min(ix + 1, segs)];
        const hD = heights[Math.max(iz - 1, 0) * n + ix];
        const hU = heights[Math.min(iz + 1, segs) * n + ix];
        const dhdx = (hR - hL) / ((Math.min(ix + 1, segs) - Math.max(ix - 1, 0)) * step);
        const dhdz = (hU - hD) / ((Math.min(iz + 1, segs) - Math.max(iz - 1, 0)) * step);
        const inv = 1 / Math.hypot(dhdx, 1, dhdz);
        normals[i * 3] = -dhdx * inv;
        normals[i * 3 + 1] = inv;
        normals[i * 3 + 2] = -dhdz * inv;
      }
    }
    const skirtDepth = SKIRT_DEPTH[lod];
    for (let j = 0; j < perimCount; j++) {
      const s = perim[j];
      const d = surfVertCount + j;
      positions[d * 3] = positions[s * 3];
      positions[d * 3 + 1] = positions[s * 3 + 1] - skirtDepth;
      positions[d * 3 + 2] = positions[s * 3 + 2];
      normals[d * 3] = normals[s * 3];
      normals[d * 3 + 1] = normals[s * 3 + 1];
      normals[d * 3 + 2] = normals[s * 3 + 2];
    }

    const surfIndexCount = segs * segs * 6;
    const indices = new Uint32Array(surfIndexCount + perimCount * 6);
    let k = 0;
    for (let iz = 0; iz < segs; iz++) {
      for (let ix = 0; ix < segs; ix++) {
        const a = iz * n + ix, b = a + 1, c = a + n, d = c + 1;
        indices[k++] = a; indices[k++] = c; indices[k++] = b;
        indices[k++] = b; indices[k++] = c; indices[k++] = d;
      }
    }
    for (let j = 0; j < perimCount; j++) {
      const j2 = (j + 1) % perimCount;
      const s0 = perim[j], s1 = perim[j2];
      const d0 = surfVertCount + j, d1 = surfVertCount + j2;
      indices[k++] = s0; indices[k++] = d0; indices[k++] = s1;
      indices[k++] = s1; indices[k++] = d0; indices[k++] = d1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.userData.key = job.key;
    mesh.matrixAutoUpdate = false;

    return {
      key: job.key, lod, ix: job.ix, iz: job.iz, mesh,
      tris: indices.length / 3,
      box: geo.boundingBox!.clone(),
      heights, segs, originX, originZ, size,
      surfVerts: surfVertCount, surfIndices: surfIndexCount,
    };
  }

  /** 视锥剔除 + 山脊遮挡剔除 */
  private cull(camera: THREE.PerspectiveCamera): void {
    this.mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.mvp);
    const cam = camera.position;
    let frustumCulled = 0, occluded = 0, submitted = 0;
    for (const rec of this.tiles.values()) {
      let visible = this.frustum.intersectsBox(rec.box);
      if (visible) {
        const cx = (rec.box.min.x + rec.box.max.x) / 2;
        const cz = (rec.box.min.z + rec.box.max.z) / 2;
        const d2 = (cx - cam.x) ** 2 + (cz - cam.z) ** 2;
        if (d2 > 700 * 700 && rec.box.max.y < cam.y - 5 && this.occludedByRidge(cam, rec)) {
          visible = false;
          occluded++;
        }
      } else {
        frustumCulled++;
      }
      rec.mesh.visible = visible;
      if (visible) submitted++;
    }
    this.statFrustum = frustumCulled;
    this.statOccluded = occluded;
    this.statSubmitted = submitted;
  }

  /**
   * 山脊遮挡测试:从相机向瓦片中心顶部与四角顶部连线,
   * 沿射线步进采样解析高程场,若所有采样线都被地形截断则判定被遮挡。
   */
  private occludedByRidge(cam: THREE.Vector3, rec: TileRec): boolean {
    const b = rec.box;
    const pts: Array<[number, number, number]> = [
      [(b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2],
      [b.min.x, b.max.y, b.min.z],
      [b.max.x, b.max.y, b.min.z],
      [b.min.x, b.max.y, b.max.z],
      [b.max.x, b.max.y, b.max.z],
    ];
    for (const p of pts) {
      const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
      const dist = Math.hypot(dx, dz);
      const steps = Math.min(36, Math.max(8, Math.ceil(dist / 80)));
      let blocked = false;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const gy = cam.y + dy * t;
        if (terrainHeight(cam.x + dx * t, cam.z + dz * t) > gy + 2) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return false; // 有一条视线通畅即可见
    }
    return true;
  }
}
