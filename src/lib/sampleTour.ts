/**
 * 示例漫游模板：三张全景 + 一组带分组的热点与导航链路。
 * 经纬度经过挑选，落在各场景的显著位置。
 */
import type { Hotspot, HotspotGroup, PanoramaNode, Tour } from './tour';
import { GROUP_PALETTE, TOUR_FORMAT, TOUR_VERSION, newId } from './tour';

interface SamplePano {
  id: string;
  name: string;
  src: string;
  fileName: string;
}

export const SAMPLE_PANOS: SamplePano[] = [
  { id: 'pano-entrance', name: '入口大厅', src: '/samples/entrance.png', fileName: 'entrance.png' },
  { id: 'pano-canopy', name: '雨林温室', src: '/samples/canopy.png', fileName: 'canopy.png' },
  { id: 'pano-night', name: '夜行馆', src: '/samples/night.png', fileName: 'night.png' },
];

function hs(partial: Omit<Hotspot, 'id' | 'label'> & { label: string }): Hotspot {
  return { ...partial, id: newId('hs') };
}

export function buildSampleTour(panos: PanoramaNode[]): Tour {
  const groups: HotspotGroup[] = [
    { id: 'g-route', name: '通道', color: GROUP_PALETTE[0], visible: true, locked: false },
    { id: 'g-exhibit', name: '展项', color: GROUP_PALETTE[1], visible: true, locked: false },
    { id: 'g-note', name: '说明', color: GROUP_PALETTE[2], visible: true, locked: false },
    { id: 'g-flow', name: '动线', color: GROUP_PALETTE[3], visible: true, locked: false },
  ];
  const byId = new Map(panos.map((p) => [p.id, p]));
  const entrance = byId.get('pano-entrance');
  const canopy = byId.get('pano-canopy');
  const night = byId.get('pano-night');
  const nodes: PanoramaNode[] = panos.map((p) => ({ ...p, hotspots: [] }));

  const put = (panoId: string, list: Hotspot[]) => {
    const n = nodes.find((x) => x.id === panoId);
    if (n) n.hotspots.push(...list);
  };

  if (entrance) {
    put('pano-entrance', [
      hs({
        type: 'nav',
        groupId: 'g-route',
        lon: 0,
        lat: -12,
        label: '前往雨林温室',
        description: '穿过中庭的玻璃廊道，进入恒温雨林展区。',
        target: { panorama: 'pano-canopy', lon: 0, lat: -4, fov: 76, fadeMs: 800 },
      }),
      hs({
        type: 'nav',
        groupId: 'g-route',
        lon: -92,
        lat: -10,
        label: '夜行馆入口',
        description: '左转进入暗光展区，请给眼睛一点适应时间。',
        target: { panorama: 'pano-night', lon: 0, lat: 2, fov: 66, fadeMs: 1000 },
      }),
      hs({
        type: 'info',
        groupId: 'g-exhibit',
        lon: 0,
        lat: -6,
        label: '年轮切片',
        description: '这株红杉的年轮有 312 圈，记录着三个世纪的雨季与旱季。',
      }),
      hs({
        type: 'info',
        groupId: 'g-exhibit',
        lon: 44,
        lat: -2,
        label: '中庭罗盘',
        description: '地面镶嵌的罗盘指向真北，是导览路线的起点。',
        showLeader: true,
      }),
      hs({
        type: 'label',
        groupId: 'g-note',
        lon: -40,
        lat: 8,
        label: '集合点',
      }),
      hs({
        type: 'arrow',
        groupId: 'g-flow',
        lon: 22,
        lat: -18,
        label: '参观动线',
        heading: 90,
      }),
    ]);
    if (entrance) entrance.initialView = { lon: 0, lat: -6, fov: 74 };
  }

  if (canopy) {
    put('pano-canopy', [
      hs({
        type: 'nav',
        groupId: 'g-route',
        lon: 0,
        lat: -6,
        label: '返回入口大厅',
        description: '回到中庭。',
        target: { panorama: 'pano-entrance', lon: 0, lat: -6, fov: 74, fadeMs: 800 },
      }),
      hs({
        type: 'nav',
        groupId: 'g-route',
        lon: 88,
        lat: -8,
        label: '走向夜行馆',
        target: { panorama: 'pano-night', lon: 0, lat: 2, fov: 66, fadeMs: 1000 },
      }),
      hs({
        type: 'info',
        groupId: 'g-exhibit',
        lon: -34,
        lat: 4,
        label: '见血封喉',
        description: '乳汁有剧毒，导览员会在整点演示防护处理。',
      }),
      hs({
        type: 'info',
        groupId: 'g-exhibit',
        lon: 42,
        lat: 12,
        label: '雨林冠层',
        description: '穹顶最高处 13 米，午后会有雾森系统模拟热带降雨。',
        showLeader: true,
      }),
      hs({
        type: 'label',
        groupId: 'g-note',
        lon: 150,
        lat: -4,
        label: '蕨类角',
      }),
      hs({
        type: 'arrow',
        groupId: 'g-flow',
        lon: -70,
        lat: -14,
        label: '单向通行',
        heading: 300,
      }),
    ]);
    canopy.initialView = { lon: 0, lat: -2, fov: 78 };
  }

  if (night) {
    put('pano-night', [
      hs({
        type: 'nav',
        groupId: 'g-route',
        lon: 0,
        lat: -6,
        label: '返回入口大厅',
        target: { panorama: 'pano-entrance', lon: 0, lat: -6, fov: 74, fadeMs: 900 },
      }),
      hs({
        type: 'nav',
        groupId: 'g-route',
        lon: -88,
        lat: -6,
        label: '回到雨林温室',
        target: { panorama: 'pano-canopy', lon: 0, lat: -2, fov: 78, fadeMs: 900 },
      }),
      hs({
        type: 'info',
        groupId: 'g-exhibit',
        lon: 28,
        lat: -18,
        label: '发光菌丛',
        description: '生物荧光来自菌丝体中的荧光素酶反应，请勿触摸。',
      }),
      hs({
        type: 'info',
        groupId: 'g-exhibit',
        lon: -18,
        lat: 16,
        label: '星空穹顶',
        description: '穹顶投影的是本地冬季的真实星图。',
      }),
      hs({
        type: 'label',
        groupId: 'g-note',
        lon: 120,
        lat: 0,
        label: '请保持安静',
      }),
      hs({
        type: 'arrow',
        groupId: 'g-flow',
        lon: 60,
        lat: -20,
        label: '出口方向',
        heading: 180,
      }),
    ]);
    night.initialView = { lon: 0, lat: 2, fov: 66 };
  }

  const now = new Date().toISOString();
  return {
    format: TOUR_FORMAT,
    version: TOUR_VERSION,
    title: '林间漫游 · 自然探索馆',
    description: '从入口大厅出发，穿过雨林温室，最后进入夜行馆。拖动画面环视，点击热点前往下一处展区。',
    createdAt: now,
    updatedAt: now,
    startId: entrance?.id ?? panos[0]?.id ?? '',
    groups,
    panoramas: nodes,
  };
}
