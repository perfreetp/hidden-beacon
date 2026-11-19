/**
 * 漫游数据模型：全景节点、热点、分组，以及 tour.json 的读写与校验。
 */
import { clampFov, clampLat, wrapLon } from './geo';

export const TOUR_FORMAT = 'pano-tour/v1';
export const TOUR_VERSION = 1;

export type HotspotType = 'nav' | 'info' | 'label' | 'arrow';

export interface CameraView {
  lon: number;
  lat: number;
  fov: number;
}

export interface HotspotTarget {
  panorama: string;
  lon: number;
  lat: number;
  fov: number;
  /** 过渡时长（毫秒） */
  fadeMs?: number;
}

export interface Hotspot {
  id: string;
  type: HotspotType;
  groupId: string;
  lon: number;
  lat: number;
  label: string;
  description?: string;
  /** 箭头的罗盘朝向：0=北，90=东 */
  heading?: number;
  target?: HotspotTarget;
  /** 仅箭头/标注生效：是否显示引导线 */
  showLeader?: boolean;
  createdAt?: string;
}

export interface HotspotGroup {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

export interface PanoramaNode {
  id: string;
  name: string;
  /** 图片地址；导入的本地图片用 blob: URL，导出时写入 fileName */
  src: string;
  fileName?: string;
  width: number;
  height: number;
  initialView: CameraView;
  hotspots: Hotspot[];
  note?: string;
}

export interface Tour {
  format: string;
  version: number;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  startId: string;
  groups: HotspotGroup[];
  panoramas: PanoramaNode[];
}

export const GROUP_PALETTE = [
  '#5fd3a8',
  '#f2b545',
  '#7fb2ff',
  '#ef7fa8',
  '#b58cff',
  '#54c8e0',
  '#f2884b',
  '#9bd45a',
];

export function newId(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}`;
}

export function slugId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

export function round(v: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

export function makeCamera(lon = 0, lat = 0, fov = 70): CameraView {
  return { lon: wrapLon(lon), lat: clampLat(lat), fov: clampFov(fov) };
}

export function normalizeHotspot(h: Hotspot): Hotspot {
  const out: Hotspot = {
    ...h,
    lon: wrapLon(round(h.lon, 3)),
    lat: clampLat(round(h.lat, 3)),
    label: (h.label ?? '').trim() || defaultLabel(h.type),
  };
  if (h.type === 'arrow') {
    out.heading = normalizeHeading(h.heading ?? 0);
  } else if (out.heading !== undefined) {
    out.heading = normalizeHeading(out.heading);
  }
  if (h.type === 'nav' && h.target) {
    out.target = {
      panorama: h.target.panorama,
      lon: wrapLon(round(h.target.lon, 3)),
      lat: clampLat(round(h.target.lat, 3)),
      fov: clampFov(round(h.target.fov, 1)),
      fadeMs: Math.max(0, Math.min(4000, Math.round(h.target.fadeMs ?? 700))),
    };
  } else {
    delete out.target;
  }
  return out;
}

export function normalizeHeading(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

export function defaultLabel(type: HotspotType): string {
  switch (type) {
    case 'nav':
      return '前往';
    case 'info':
      return '讲解点';
    case 'label':
      return '标注';
    case 'arrow':
      return '方向';
  }
}

export function defaultGroupFor(type: HotspotType, groups: HotspotGroup[]): string {
  const map: Record<HotspotType, string> = {
    nav: '通道',
    info: '展项',
    label: '说明',
    arrow: '动线',
  };
  const name = map[type];
  return groups.find((g) => g.name === name)?.id ?? groups[0]?.id ?? 'g-default';
}

export function createTour(title = '林间漫游 · 自然探索馆'): Tour {
  const now = new Date().toISOString();
  const groups: HotspotGroup[] = [
    { id: 'g-route', name: '通道', color: GROUP_PALETTE[0], visible: true, locked: false },
    { id: 'g-exhibit', name: '展项', color: GROUP_PALETTE[1], visible: true, locked: false },
    { id: 'g-note', name: '说明', color: GROUP_PALETTE[2], visible: true, locked: false },
    { id: 'g-flow', name: '动线', color: GROUP_PALETTE[3], visible: true, locked: false },
  ];
  return {
    format: TOUR_FORMAT,
    version: TOUR_VERSION,
    title,
    description: '拖动画面环视，点击热点前往下一处展区。',
    createdAt: now,
    updatedAt: now,
    startId: '',
    groups,
    panoramas: [],
  };
}

/* ---------------- 校验 ---------------- */

export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export function validateTour(input: unknown): { tour: Tour | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const push = (level: 'error' | 'warning', path: string, message: string) =>
    issues.push({ level, path, message });
  if (!input || typeof input !== 'object') {
    push('error', '$', 'tour.json 必须是 JSON 对象');
    return { tour: null, issues };
  }
  const o = input as Record<string, unknown>;
  if (typeof o.format === 'string' && o.format !== TOUR_FORMAT) {
    push('warning', 'format', `未知格式 ${o.format}，已按 ${TOUR_FORMAT} 处理`);
  }
  if (!Array.isArray(o.panoramas)) {
    push('error', 'panoramas', '缺少 panoramas 数组');
    return { tour: null, issues };
  }
  if (o.panoramas.length === 0) push('warning', 'panoramas', '没有任何全景节点');

  const groups: HotspotGroup[] = [];
  if (Array.isArray(o.groups)) {
    o.groups.forEach((g, i) => {
      if (!g || typeof g !== 'object') {
        push('error', `groups[${i}]`, '分组必须是对象');
        return;
      }
      const gg = g as Record<string, unknown>;
      const id = typeof gg.id === 'string' && gg.id ? gg.id : `g-${i}`;
      if (groups.some((x) => x.id === id)) push('warning', `groups[${i}].id`, `重复的分组 id ${id}`);
      groups.push({
        id,
        name: typeof gg.name === 'string' && gg.name ? gg.name : `分组 ${i + 1}`,
        color: typeof gg.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(gg.color) ? gg.color : GROUP_PALETTE[i % GROUP_PALETTE.length],
        visible: gg.visible !== false,
        locked: gg.locked === true,
      });
    });
  }
  if (!groups.length) {
    groups.push({ id: 'g-default', name: '默认分组', color: GROUP_PALETTE[0], visible: true, locked: false });
    push('warning', 'groups', '缺少分组定义，已补一个默认分组');
  }

  const panoramas: PanoramaNode[] = [];
  const ids = new Set<string>();
  o.panoramas.forEach((p, i) => {
    if (!p || typeof p !== 'object') {
      push('error', `panoramas[${i}]`, '全景节点必须是对象');
      return;
    }
    const pp = p as Record<string, unknown>;
    const id = typeof pp.id === 'string' && pp.id ? pp.id : `pano-${i + 1}`;
    if (ids.has(id)) push('error', `panoramas[${i}].id`, `重复的全景 id ${id}`);
    ids.add(id);
    const width = Number(pp.width);
    const height = Number(pp.height);
    if (!(width > 0) || !(height > 0)) push('error', `panoramas[${i}].size`, '缺少有效的宽高');
    else if (Math.abs(width / height - 2) > 0.04) push('warning', `panoramas[${i}].size`, `宽高比 ${(width / height).toFixed(3)} 不是 2:1`);
    const iv = (pp.initialView ?? {}) as Record<string, unknown>;
    const hotspots: Hotspot[] = [];
    const hsIds = new Set<string>();
    if (Array.isArray(pp.hotspots)) {
      pp.hotspots.forEach((h, j) => {
        if (!h || typeof h !== 'object') {
          push('error', `panoramas[${i}].hotspots[${j}]`, '热点必须是对象');
          return;
        }
        const hh = h as Record<string, unknown>;
        const type = hh.type;
        if (type !== 'nav' && type !== 'info' && type !== 'label' && type !== 'arrow') {
          push('error', `panoramas[${i}].hotspots[${j}].type`, `未知热点类型 ${String(type)}`);
          return;
        }
        const lon = Number(hh.lon);
        const lat = Number(hh.lat);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
          push('error', `panoramas[${i}].hotspots[${j}]`, '经纬度必须是数字');
          return;
        }
        if (Math.abs(lat) > 90) push('warning', `panoramas[${i}].hotspots[${j}].lat`, '纬度超出 ±90，已夹紧');
        const hid = typeof hh.id === 'string' && hh.id ? hh.id : `hs-${i}-${j}`;
        if (hsIds.has(hid)) push('warning', `panoramas[${i}].hotspots[${j}].id`, `重复热点 id ${hid}`);
        hsIds.add(hid);
        let groupId = typeof hh.groupId === 'string' ? hh.groupId : typeof hh.group === 'string' ? (hh.group as string) : groups[0].id;
        if (!groups.some((g) => g.id === groupId)) {
          push('warning', `panoramas[${i}].hotspots[${j}].groupId`, `未知分组 ${groupId}，已归入默认分组`);
          groupId = groups[0].id;
        }
        const t = hh.target as Record<string, unknown> | undefined;
        let target: HotspotTarget | undefined;
        if (t && typeof t === 'object') {
          const panorama = typeof t.panorama === 'string' ? t.panorama : String(t.panorama ?? '');
          target = {
            panorama,
            lon: Number(t.lon ?? 0),
            lat: Number(t.lat ?? 0),
            fov: clampFov(Number(t.fov ?? 70)),
            fadeMs: Math.max(0, Math.min(4000, Number(t.fadeMs ?? 700))),
          };
          if (type === 'nav' && !panorama) push('error', `panoramas[${i}].hotspots[${j}].target`, '导航热点缺少目标全景');
        }
        if (type === 'nav' && !target) push('warning', `panoramas[${i}].hotspots[${j}].target`, '导航热点尚未设置目标全景');
        const normalized = normalizeHotspot({
          id: hid,
          type,
          groupId,
          lon,
          lat,
          label: typeof hh.label === 'string' ? hh.label : '',
          description: typeof hh.description === 'string' ? hh.description : undefined,
          heading: hh.heading === undefined ? undefined : Number(hh.heading),
          target,
          showLeader: hh.showLeader === true ? true : hh.showLeader === false ? false : undefined,
          createdAt: typeof hh.createdAt === 'string' ? hh.createdAt : undefined,
        });
        hotspots.push(normalized);
      });
    }
    panoramas.push({
      id,
      name: typeof pp.name === 'string' && pp.name ? pp.name : `全景 ${i + 1}`,
      src: typeof pp.src === 'string' ? pp.src : '',
      fileName: typeof pp.fileName === 'string' ? pp.fileName : undefined,
      width: width > 0 ? width : 2048,
      height: height > 0 ? height : 1024,
      initialView: makeCamera(Number(iv.lon ?? 0), Number(iv.lat ?? 0), Number(iv.fov ?? 70)),
      hotspots,
      note: typeof pp.note === 'string' ? pp.note : undefined,
    });
  });

  // 目标引用检查
  for (const p of panoramas) {
    for (const h of p.hotspots) {
      if (h.type === 'nav' && h.target && !panoramas.some((q) => q.id === h.target!.panorama)) {
        push('error', `panoramas[${p.id}].hotspots[${h.id}].target.panorama`, `目标全景 ${h.target.panorama} 不存在`);
      }
    }
  }

  let startId = typeof o.startId === 'string' ? o.startId : '';
  if (startId && !panoramas.some((p) => p.id === startId)) {
    push('warning', 'startId', `起点 ${startId} 不存在，已改用第一张全景`);
    startId = panoramas[0]?.id ?? '';
  }
  if (!startId) startId = panoramas[0]?.id ?? '';

  if (issues.some((x) => x.level === 'error')) {
    return { tour: null, issues };
  }

  const tour: Tour = {
    format: TOUR_FORMAT,
    version: TOUR_VERSION,
    title: typeof o.title === 'string' && o.title ? o.title : '未命名漫游',
    description: typeof o.description === 'string' ? o.description : '',
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
    startId,
    groups,
    panoramas,
  };
  return { tour, issues };
}

/* ---------------- 导出 ---------------- */

export interface ExportOptions {
  /** 是否把热点按分组聚合成 groups 里的索引表 */
  includeIndex?: boolean;
  /** 保留两位小数的经纬度 */
  precision?: number;
}

export function serializeTour(tour: Tour, opts: ExportOptions = {}): string {
  const precision = opts.precision ?? 2;
  const groups = tour.groups.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    visible: g.visible,
    locked: g.locked,
  }));
  const panoramas = tour.panoramas.map((p) => ({
    id: p.id,
    name: p.name,
    src: p.fileName ?? p.src,
    fileName: p.fileName ?? undefined,
    width: p.width,
    height: p.height,
    initialView: {
      lon: round(p.initialView.lon, precision),
      lat: round(p.initialView.lat, precision),
      fov: round(p.initialView.fov, 1),
    },
    hotspots: p.hotspots.map((h) => {
      const base: Record<string, unknown> = {
        id: h.id,
        type: h.type,
        groupId: h.groupId,
        lon: round(h.lon, precision),
        lat: round(h.lat, precision),
        label: h.label,
      };
      if (h.description) base.description = h.description;
      if (h.type === 'arrow' || h.heading !== undefined) base.heading = round(normalizeHeading(h.heading ?? 0), 1);
      if (h.type === 'nav' && h.target) {
        base.target = {
          panorama: h.target.panorama,
          lon: round(h.target.lon, precision),
          lat: round(h.target.lat, precision),
          fov: round(h.target.fov, 1),
          fadeMs: h.target.fadeMs ?? 700,
        };
      }
      if (h.showLeader) base.showLeader = true;
      return base;
    }),
  }));
  const payload: Record<string, unknown> = {
    format: TOUR_FORMAT,
    version: TOUR_VERSION,
    title: tour.title,
    description: tour.description,
    createdAt: tour.createdAt,
    updatedAt: tour.updatedAt,
    startId: tour.startId,
    groups,
    panoramas,
  };
  if (opts.includeIndex !== false) {
    payload.index = {
      hotspots: panoramas.reduce((n, p) => n + p.hotspots.length, 0),
      byGroup: Object.fromEntries(
        groups.map((g) => [
          g.id,
          panoramas.reduce((n, p) => n + p.hotspots.filter((h) => h.groupId === g.id).length, 0),
        ]),
      ),
      byType: ['nav', 'info', 'label', 'arrow'].reduce<Record<string, number>>((acc, t) => {
        acc[t] = panoramas.reduce((n, p) => n + p.hotspots.filter((h) => h.type === t).length, 0);
        return acc;
      }, {}),
    };
  }
  return JSON.stringify(payload, null, 2);
}

/** 由热点集合统计各分组数量 */
export function groupCounts(panoramas: PanoramaNode[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of panoramas) for (const h of p.hotspots) out[h.groupId] = (out[h.groupId] ?? 0) + 1;
  return out;
}

export function tourStats(tour: Tour): {
  panoramas: number;
  hotspots: number;
  navLinks: number;
  groups: number;
  orphans: number;
} {
  let hotspots = 0;
  let navLinks = 0;
  const targets = new Set<string>();
  for (const p of tour.panoramas) {
    for (const h of p.hotspots) {
      hotspots++;
      if (h.type === 'nav' && h.target) {
        navLinks++;
        targets.add(h.target.panorama);
      }
    }
  }
  const orphans = tour.panoramas.filter((p) => p.id !== tour.startId && !targets.has(p.id)).length;
  return { panoramas: tour.panoramas.length, hotspots, navLinks, groups: tour.groups.length, orphans };
}

/** 复制热点（用于复制粘贴 / 从热点生成新节点） */
export function cloneHotspot(h: Hotspot, offsetLon = 0): Hotspot {
  return normalizeHotspot({
    ...h,
    id: newId('hs'),
    lon: h.lon + offsetLon,
    target: h.target ? { ...h.target } : undefined,
    createdAt: new Date().toISOString(),
  });
}
