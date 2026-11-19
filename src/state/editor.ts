/**
 * 编辑器状态：一份可撤销的 tour 文档 + 瞬态 UI 状态。
 * 用 Solid 的 createStore 管理文档，快照式撤销栈只保存文档。
 */
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import { createSignal } from 'solid-js';
import {
  Hotspot,
  HotspotGroup,
  HotspotTarget,
  HotspotType,
  PanoramaNode,
  Tour,
  createTour,
  defaultGroupFor,
  defaultLabel,
  makeCamera,
  newId,
  normalizeHeading,
  normalizeHotspot,
  round,
  validateTour,
  type ValidationIssue,
} from '../lib/tour';
import { Camera, FOV_MAX, FOV_MIN, clampFov, clampLat, formatLonLat, wrapLon } from '../lib/geo';

export type Tool = 'select' | 'hotspot' | 'pan';
export type DialogKind = null | 'seam' | 'import' | 'export' | 'help';

export interface EditorState {
  tour: Tour;
  /** 当前全景节点 id */
  activeId: string;
  selectedHotspotId: string | null;
  selectedGroupId: string | null;
  tool: Tool;
  /** 新建热点时默认类型 */
  newHotspotType: HotspotType;
  camera: Camera;
  /** 正在编辑目标（取景器模式）的热点 id */
  pickingTargetFor: string | null;
  dialog: DialogKind;
  /** 提示消息 */
  toast: { id: number; text: string; tone: 'info' | 'ok' | 'warn' } | null;
  showGrid: boolean;
  showHotspots: boolean;
  /** 缩略球小地图尺寸 */
  minimapSize: number;
}

let toastSeq = 0;

export function createEditor(initial?: Tour) {
  const tour = initial ?? createTour();
  const first = tour.panoramas[0];
  const [state, setState] = createStore<EditorState>({
    tour,
    activeId: first?.id ?? '',
    selectedHotspotId: null,
    selectedGroupId: null,
    tool: 'select',
    newHotspotType: 'info',
    camera: first ? { yaw: first.initialView.lon, pitch: first.initialView.lat, fov: first.initialView.fov } : { yaw: 0, pitch: 0, fov: 70 },
    pickingTargetFor: null,
    dialog: null,
    toast: null,
    showGrid: false,
    showHotspots: true,
    minimapSize: 176,
  });

  const undoStack: string[] = [];
  const redoStack: string[] = [];
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [issues, setIssues] = createSignal<ValidationIssue[]>([]);

  function refreshUndoFlags() {
    setCanUndo(undoStack.length > 0);
    setCanRedo(redoStack.length > 0);
  }

  function snapshot(): string {
    return JSON.stringify(unwrap(state.tour));
  }

  /** 记录一次可撤销的文档改动 */
  function commit(mutator: (t: Tour) => void, opts: { coalesce?: string } = {}) {
    const before = snapshot();
    setState('tour', produce(mutator));
    const after = snapshot();
    if (before === after) return;
    if (opts.coalesce && undoStack.length && lastCoalesceKey === opts.coalesce) {
      // 合并连续同类操作（例如拖拽中的多次微调）
      lastCoalesceAt = Date.now();
    } else {
      undoStack.push(before);
      if (undoStack.length > 120) undoStack.shift();
    }
    lastCoalesceKey = opts.coalesce ?? null;
    redoStack.length = 0;
    setState('tour', 'updatedAt', new Date().toISOString());
    setDirty(true);
    refreshUndoFlags();
  }

  let lastCoalesceKey: string | null = null;
  let lastCoalesceAt = 0;

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(snapshot());
    applySnapshot(prev);
    refreshUndoFlags();
  }

  function redo() {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(snapshot());
    applySnapshot(next);
    refreshUndoFlags();
  }

  function applySnapshot(json: string) {
    const t = JSON.parse(json) as Tour;
    setState('tour', reconcile(t, { key: 'id' }));
    if (!t.panoramas.some((p) => p.id === state.activeId)) {
      const firstPano = t.panoramas[0];
      setState('activeId', firstPano?.id ?? '');
      if (firstPano) {
        setState('camera', { yaw: firstPano.initialView.lon, pitch: firstPano.initialView.lat, fov: firstPano.initialView.fov });
      }
    }
    if (state.selectedHotspotId && !activePano()?.hotspots.some((h) => h.id === state.selectedHotspotId)) {
      setState('selectedHotspotId', null);
    }
    setDirty(true);
  }

  /* ---------------- 派生值 ---------------- */

  const activePano = (): PanoramaNode | undefined =>
    state.tour.panoramas.find((p) => p.id === state.activeId);

  const selectedHotspot = (): Hotspot | undefined => {
    const p = activePano();
    if (!p || !state.selectedHotspotId) return undefined;
    return p.hotspots.find((h) => h.id === state.selectedHotspotId);
  };

  const visibleGroups = (): HotspotGroup[] => state.tour.groups.filter((g) => g.visible);

  function groupById(id: string): HotspotGroup | undefined {
    return state.tour.groups.find((g) => g.id === id);
  }

  function isHotspotVisible(h: Hotspot): boolean {
    const g = groupById(h.groupId);
    return state.showHotspots && (g?.visible ?? true);
  }

  /* ---------------- 相机 ---------------- */

  function setCamera(next: Partial<Camera>, fromUser = true) {
    setState('camera', (c) => ({
      yaw: next.yaw !== undefined ? wrapLon(next.yaw) : c.yaw,
      pitch: next.pitch !== undefined ? clampLat(next.pitch) : c.pitch,
      fov: next.fov !== undefined ? clampFov(next.fov) : c.fov,
    }));
    if (fromUser) setDirty(true);
  }

  function setFov(fov: number) {
    setCamera({ fov: clampFov(fov) });
  }

  function flyTo(cam: Camera) {
    setCamera(cam, false);
  }

  /** 把当前视角保存为该全景的初始视角 */
  function saveInitialView() {
    const p = activePano();
    if (!p) return;
    commit((t) => {
      const node = t.panoramas.find((x) => x.id === p.id);
      if (!node) return;
      node.initialView = makeCamera(state.camera.yaw, state.camera.pitch, state.camera.fov);
    });
    notify('已保存为初始视角', 'ok');
  }

  /* ---------------- 全景节点 ---------------- */

  function addPanorama(data: Omit<PanoramaNode, 'hotspots' | 'initialView'> & { initialView?: PanoramaNode['initialView'] }) {
    const id = data.id || newId('pano');
    const node: PanoramaNode = {
      ...data,
      id,
      initialView: data.initialView ?? makeCamera(0, 0, 70),
      hotspots: [],
    };
    commit((t) => {
      t.panoramas.push(node);
      if (!t.startId) t.startId = id;
    });
    return id;
  }

  function removePanorama(id: string) {
    const t = unwrap(state.tour);
    if (t.panoramas.length <= 1) {
      notify('至少要保留一张全景', 'warn');
      return;
    }
    const node = t.panoramas.find((p) => p.id === id);
    if (!node) return;
    const incoming = t.panoramas
      .filter((p) => p.id !== id)
      .flatMap((p) => p.hotspots.filter((h) => h.type === 'nav' && h.target?.panorama === id).map((h) => ({ pano: p.id, hotspot: h.id })));
    commit((doc) => {
      doc.panoramas = doc.panoramas.filter((p) => p.id !== id);
      // 清理指向被删节点的导航热点目标
      for (const p of doc.panoramas) {
        for (const h of p.hotspots) {
          if (h.type === 'nav' && h.target?.panorama === id) delete h.target;
        }
      }
      if (doc.startId === id) doc.startId = doc.panoramas[0]?.id ?? '';
    });
    if (state.activeId === id) {
      const next = state.tour.panoramas[0];
      if (next) {
        switchTo(next.id, false);
      }
    }
    notify(
      incoming.length
        ? `已删除「${node.name}」，${incoming.length} 个导航热点需要重新指定目标`
        : `已删除「${node.name}」`,
      incoming.length ? 'warn' : 'info',
    );
  }

  function updatePanorama(id: string, patch: Partial<PanoramaNode>, coalesce?: string) {
    commit((t) => {
      const node = t.panoramas.find((p) => p.id === id);
      if (!node) return;
      Object.assign(node, patch);
    }, { coalesce });
  }

  function switchTo(id: string, restoreInitial = true) {
    const pano = state.tour.panoramas.find((p) => p.id === id);
    if (!pano) return;
    setState('activeId', id);
    if (restoreInitial) {
      setCamera({ yaw: pano.initialView.lon, pitch: pano.initialView.lat, fov: pano.initialView.fov }, false);
    }
    setState('selectedHotspotId', null);
    setState('pickingTargetFor', null);
    setState('camera', 'fov', (f) => clampFov(f));
  }

  /* ---------------- 热点 ---------------- */

  function addHotspot(partial: Partial<Hotspot> & { lon: number; lat: number; type: HotspotType }): string | null {
    const pano = activePano();
    if (!pano) {
      notify('请先导入一张全景图', 'warn');
      return null;
    }
    // 明确指定 > 左侧当前选中分组 > 按类型推断的默认分组
    const groupId =
      partial.groupId ??
      (state.selectedGroupId && groupById(state.selectedGroupId) && !groupById(state.selectedGroupId)!.locked
        ? state.selectedGroupId
        : undefined) ??
      defaultGroupFor(partial.type, state.tour.groups);
    const g = groupById(groupId);
    if (g?.locked) {
      notify(`分组「${g.name}」已锁定`, 'warn');
      return null;
    }
    const id = partial.id ?? newId('hs');
    const hotspot = normalizeHotspot({
      id,
      type: partial.type,
      groupId,
      lon: partial.lon,
      lat: partial.lat,
      label: partial.label ?? defaultLabel(partial.type),
      description: partial.description,
      heading: partial.heading,
      target: partial.target,
      createdAt: new Date().toISOString(),
    });
    commit((t) => {
      const node = t.panoramas.find((p) => p.id === pano.id);
      node?.hotspots.push(hotspot);
    });
    setState('selectedHotspotId', id);
    return id;
  }

  /** 批量追加热点（用于模板套用），只产生一个撤销项 */
  function addHotspotsBulk(panoId: string, list: Hotspot[]) {
    if (!list.length) return;
    const nodes = list.map((h) =>
      normalizeHotspot({
        ...JSON.parse(JSON.stringify(h)),
        id: newId('hs'),
        createdAt: new Date().toISOString(),
      }),
    );
    commit((t) => {
      const node = t.panoramas.find((p) => p.id === panoId);
      if (node) node.hotspots.push(...nodes);
    });
  }

  function updateHotspot(id: string, patch: Partial<Hotspot>, opts: { coalesce?: string } = {}) {
    const pano = activePano();
    if (!pano) return;
    const current = pano.hotspots.find((h) => h.id === id);
    if (!current) return;
    const g = groupById(current.groupId);
    if (g?.locked) return;
    commit((t) => {
      const node = t.panoramas.find((p) => p.id === pano.id);
      const h = node?.hotspots.find((x) => x.id === id);
      if (!h) return;
      Object.assign(h, patch);
      if (patch.lon !== undefined) h.lon = round(wrapLon(patch.lon), 3);
      if (patch.lat !== undefined) h.lat = clampLat(round(patch.lat, 3));
      if (patch.heading !== undefined) h.heading = normalizeHeading(patch.heading);
      if (patch.lon !== undefined || patch.lat !== undefined) {
        // 位置变更时保持类型相关字段一致性
      }
    }, opts);
  }

  /** 拖动中的高频位置更新：直接写，不产生撤销项 */
  function dragHotspot(id: string, lon: number, lat: number) {
    const pano = activePano();
    if (!pano) return;
    const current = pano.hotspots.find((h) => h.id === id);
    if (!current) return;
    if (groupById(current.groupId)?.locked) return;
    setState('tour', 'panoramas', (p) => p.id === pano.id, 'hotspots', (h) => h.id === id, produce((h: Hotspot) => {
      h.lon = round(wrapLon(lon), 3);
      h.lat = clampLat(round(lat, 3));
    }));
  }

  /** 拖动结束时落一次撤销点 */
  function commitHotspotDrag(id: string, startLon: number, startLat: number) {
    const pano = activePano();
    const h = pano?.hotspots.find((x) => x.id === id);
    if (!h) return;
    if (Math.abs(h.lon - startLon) < 1e-6 && Math.abs(h.lat - startLat) < 1e-6) return;
    // 先把当前位置记下，再用“起始位置”构造历史项
    const currentLon = h.lon;
    const currentLat = h.lat;
    setState('tour', 'panoramas', (p) => p.id === pano!.id, 'hotspots', (x) => x.id === id, produce((x: Hotspot) => {
      x.lon = startLon;
      x.lat = startLat;
    }));
    commit((t) => {
      const node = t.panoramas.find((p) => p.id === pano!.id);
      const x = node?.hotspots.find((q) => q.id === id);
      if (!x) return;
      x.lon = currentLon;
      x.lat = currentLat;
    });
  }

  function removeHotspot(id: string) {
    const pano = activePano();
    if (!pano) return;
    commit((t) => {
      const node = t.panoramas.find((p) => p.id === pano.id);
      if (!node) return;
      node.hotspots = node.hotspots.filter((h) => h.id !== id);
    });
    if (state.selectedHotspotId === id) setState('selectedHotspotId', null);
  }

  function duplicateHotspot(id: string) {
    const pano = activePano();
    const h = pano?.hotspots.find((x) => x.id === id);
    if (!h) return;
    const copy = cloneForPano(h);
    commit((t) => {
      const node = t.panoramas.find((p) => p.id === pano!.id);
      node?.hotspots.push(copy);
    });
    setState('selectedHotspotId', copy.id);
  }

  function cloneForPano(h: Hotspot): Hotspot {
    return normalizeHotspot({
      ...JSON.parse(JSON.stringify(h)),
      id: newId('hs'),
      lon: wrapLon(h.lon + 6),
      createdAt: new Date().toISOString(),
    });
  }

  function setTarget(hotspotId: string, target: HotspotTarget | undefined) {
    updateHotspot(hotspotId, { target }, { coalesce: undefined });
  }

  /* ---------------- 分组 ---------------- */

  function addGroup(name?: string) {
    const id = newId('g');
    const color = GROUP_COLORS[state.tour.groups.length % GROUP_COLORS.length];
    commit((t) => {
      t.groups.push({ id, name: name ?? `分组 ${t.groups.length + 1}`, color, visible: true, locked: false });
    });
    setState('selectedGroupId', id);
    return id;
  }

  function updateGroup(id: string, patch: Partial<HotspotGroup>) {
    commit((t) => {
      const g = t.groups.find((x) => x.id === id);
      if (g) Object.assign(g, patch);
    });
  }

  function removeGroup(id: string) {
    if (state.tour.groups.length <= 1) {
      notify('至少保留一个分组', 'warn');
      return;
    }
    const fallback = state.tour.groups.find((g) => g.id !== id);
    if (!fallback) return;
    let moved = 0;
    commit((t) => {
      for (const p of t.panoramas) {
        for (const h of p.hotspots) {
          if (h.groupId === id) {
            h.groupId = fallback.id;
            moved++;
          }
        }
      }
      t.groups = t.groups.filter((g) => g.id !== id);
    });
    if (state.selectedGroupId === id) setState('selectedGroupId', fallback.id);
    notify(moved ? `已删除分组，${moved} 个热点移入「${fallback.name}」` : '已删除分组', 'info');
  }

  function moveHotspotToGroup(hotspotId: string, groupId: string) {
    updateHotspot(hotspotId, { groupId });
  }

  /* ---------------- 文档级操作 ---------------- */

  function setDocMeta(patch: Partial<Pick<Tour, 'title' | 'description' | 'startId'>>) {
    commit((t) => {
      Object.assign(t, patch);
    }, { coalesce: 'meta' });
  }

  function replaceTour(next: Tour) {
    undoStack.push(snapshot());
    redoStack.length = 0;
    setState('tour', reconcile(next, { key: 'id' }));
    const first = next.panoramas[0];
    setState('activeId', next.startId || first?.id || '');
    if (first) setCamera({ yaw: first.initialView.lon, pitch: first.initialView.lat, fov: first.initialView.fov }, false);
    setState('selectedHotspotId', null);
    setDirty(true);
    refreshUndoFlags();
  }

  function loadTourJson(text: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setIssues([{ level: 'error', path: '$', message: `JSON 解析失败：${(e as Error).message}` }]);
      return false;
    }
    const { tour, issues: v } = validateTour(parsed);
    setIssues(v);
    if (!tour) {
      notify(`导入失败：${v.filter((x) => x.level === 'error')[0]?.message ?? '格式不正确'}`, 'warn');
      return false;
    }
    replaceTour(tour);
    if (v.length) notify(`导入完成，有 ${v.length} 条提示`, 'warn');
    else notify('tour.json 已导入', 'ok');
    return true;
  }

  function notify(text: string, tone: 'info' | 'ok' | 'warn' = 'info') {
    const id = ++toastSeq;
    setState('toast', { id, text, tone });
    window.setTimeout(() => {
      if (state.toast?.id === id) setState('toast', null);
    }, 3200);
  }

  function clearDirty() {
    setDirty(false);
  }

  return {
    state,
    setState,
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
    dirty,
    clearDirty,
    issues,
    setIssues,
    activePano,
    selectedHotspot,
    visibleGroups,
    groupById,
    isHotspotVisible,
    setCamera,
    setFov,
    flyTo,
    saveInitialView,
    addPanorama,
    removePanorama,
    updatePanorama,
    switchTo,
    addHotspot,
    addHotspotsBulk,
    updateHotspot,
    dragHotspot,
    commitHotspotDrag,
    removeHotspot,
    duplicateHotspot,
    setTarget,
    addGroup,
    updateGroup,
    removeGroup,
    moveHotspotToGroup,
    setDocMeta,
    replaceTour,
    loadTourJson,
    notify,
  };
}

export type Editor = ReturnType<typeof createEditor>;

const GROUP_COLORS = ['#5fd3a8', '#f2b545', '#7fb2ff', '#ef7fa8', '#b58cff', '#54c8e0', '#f2884b', '#9bd45a'];

export function describeHotspot(h: Hotspot): string {
  const base = formatLonLat({ lon: h.lon, lat: h.lat }, 1);
  if (h.type === 'nav' && h.target) return `${base} → ${h.target.panorama}`;
  if (h.type === 'arrow') return `${base} · 朝向 ${Math.round(normalizeHeading(h.heading ?? 0))}°`;
  return base;
}
