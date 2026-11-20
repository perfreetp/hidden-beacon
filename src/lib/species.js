// 蜜源植物品种库
// layer: tree 乔木 / shrub 灌木 / herb 蜜源花草
// bloom: [春, 夏, 秋]
// moisture: 0 耐旱 .. 1 喜湿;  sun: 0 耐阴 .. 1 喜阳
export const SEASONS = ['spring', 'summer', 'autumn'];
export const SEASON_NAMES = { spring: '春季', summer: '夏季', autumn: '秋季' };
export const LAYER_NAMES = { tree: '乔木层', shrub: '灌木层', herb: '花草层' };

export const SPECIES = [
  // ---- 乔木 ----
  { id: 'cihuai',   name: '刺槐',   layer: 'tree', hMin: 8,  hMax: 15, canopy: 3.2, bloom: [1, 0, 0], bloomColor: '#f2ead8', foliage: '#4a7c3a', moisture: 0.4, sun: 0.9 },
  { id: 'luanshu',  name: '栾树',   layer: 'tree', hMin: 7,  hMax: 13, canopy: 3.0, bloom: [0, 1, 0], bloomColor: '#f5c93c', foliage: '#3f7a35', moisture: 0.5, sun: 0.8 },
  { id: 'wujiu',    name: '乌桕',   layer: 'tree', hMin: 6,  hMax: 12, canopy: 2.8, bloom: [0, 1, 0], bloomColor: '#e8e6a8', foliage: '#557f3c', moisture: 0.7, sun: 0.7 },
  { id: 'hehuan',   name: '合欢',   layer: 'tree', hMin: 6,  hMax: 12, canopy: 3.4, bloom: [0, 1, 0], bloomColor: '#f2a7b8', foliage: '#5c8a46', moisture: 0.5, sun: 0.8 },
  { id: 'guohuai',  name: '国槐',   layer: 'tree', hMin: 8,  hMax: 16, canopy: 3.5, bloom: [0, 1, 0], bloomColor: '#efe9c8', foliage: '#3d6e33', moisture: 0.4, sun: 0.8 },
  { id: 'yinghua',  name: '樱花',   layer: 'tree', hMin: 4,  hMax: 8,  canopy: 2.4, bloom: [1, 0, 0], bloomColor: '#f6c9d8', foliage: '#5d8548', moisture: 0.5, sun: 0.7 },
  { id: 'ziyeli',   name: '紫叶李', layer: 'tree', hMin: 3,  hMax: 6,  canopy: 2.0, bloom: [1, 0, 0], bloomColor: '#f3d2de', foliage: '#6e3a4d', moisture: 0.5, sun: 0.8 },
  { id: 'wuzhuku',  name: '吴茱萸', layer: 'tree', hMin: 3,  hMax: 6,  canopy: 2.0, bloom: [0, 0, 1], bloomColor: '#e9e2c0', foliage: '#4c7a3c', moisture: 0.6, sun: 0.6 },
  // ---- 灌木 ----
  { id: 'zijing',    name: '紫荆',     layer: 'shrub', hMin: 2, hMax: 4,   canopy: 1.4, bloom: [1, 0, 0], bloomColor: '#c95f9e', foliage: '#4f7d3e', moisture: 0.5, sun: 0.7 },
  { id: 'lianqiao',  name: '连翘',     layer: 'shrub', hMin: 1.5, hMax: 3, canopy: 1.2, bloom: [1, 0, 0], bloomColor: '#f2c531', foliage: '#568141', moisture: 0.4, sun: 0.8 },
  { id: 'zuiyucao',  name: '醉鱼草',   layer: 'shrub', hMin: 1.5, hMax: 3, canopy: 1.3, bloom: [0, 1, 1], bloomColor: '#9a7fc9', foliage: '#5b8a48', moisture: 0.6, sun: 0.8 },
  { id: 'mujin',     name: '木槿',     layer: 'shrub', hMin: 2, hMax: 3.5, canopy: 1.3, bloom: [0, 1, 1], bloomColor: '#e08bb1', foliage: '#4c7f3c', moisture: 0.5, sun: 0.8 },
  { id: 'xiuxianju', name: '绣线菊',   layer: 'shrub', hMin: 1, hMax: 2,   canopy: 0.9, bloom: [0, 1, 0], bloomColor: '#f4f0ea', foliage: '#61904b', moisture: 0.5, sun: 0.6 },
  { id: 'ditang',    name: '棣棠',     layer: 'shrub', hMin: 1, hMax: 2,   canopy: 1.0, bloom: [1, 0, 0], bloomColor: '#f0c93e', foliage: '#5e8f4a', moisture: 0.7, sun: 0.4 },
  { id: 'yingchun',  name: '迎春',     layer: 'shrub', hMin: 0.5, hMax: 1.5, canopy: 0.9, bloom: [1, 0, 0], bloomColor: '#f5d13d', foliage: '#527f40', moisture: 0.5, sun: 0.6 },
  // ---- 蜜源花草 ----
  { id: 'ziyunying', name: '紫云英', layer: 'herb', hMin: 0.15, hMax: 0.3, canopy: 0.35, bloom: [1, 0, 0], bloomColor: '#d98bc0', foliage: '#6a9a4e', moisture: 0.7, sun: 0.6 },
  { id: 'eryuelan',  name: '二月兰', layer: 'herb', hMin: 0.2,  hMax: 0.5, canopy: 0.35, bloom: [1, 0, 0], bloomColor: '#a58fd0', foliage: '#649550', moisture: 0.5, sun: 0.4 },
  { id: 'bosiju',    name: '波斯菊', layer: 'herb', hMin: 0.4,  hMax: 0.9, canopy: 0.4,  bloom: [0, 1, 1], bloomColor: '#e893b8', foliage: '#6f9d52', moisture: 0.4, sun: 0.9 },
  { id: 'bairiju',   name: '百日菊', layer: 'herb', hMin: 0.3,  hMax: 0.7, canopy: 0.35, bloom: [0, 1, 1], bloomColor: '#e86a5e', foliage: '#5f8f48', moisture: 0.4, sun: 0.9 },
  { id: 'mabiancao', name: '马鞭草', layer: 'herb', hMin: 0.5,  hMax: 1.1, canopy: 0.4,  bloom: [0, 1, 1], bloomColor: '#8d74c9', foliage: '#5c8c46', moisture: 0.5, sun: 0.8 },
  { id: 'bohe',      name: '薄荷',   layer: 'herb', hMin: 0.2,  hMax: 0.5, canopy: 0.3,  bloom: [0, 1, 0], bloomColor: '#cfd8ea', foliage: '#4e8a44', moisture: 0.8, sun: 0.5 },
  { id: 'xunyicao',  name: '薰衣草', layer: 'herb', hMin: 0.3,  hMax: 0.6, canopy: 0.35, bloom: [0, 1, 0], bloomColor: '#9278c4', foliage: '#7d9a6a', moisture: 0.3, sun: 1.0 },
  { id: 'jinjiju',   name: '金鸡菊', layer: 'herb', hMin: 0.3,  hMax: 0.6, canopy: 0.35, bloom: [0, 1, 1], bloomColor: '#f0c437', foliage: '#61914b', moisture: 0.4, sun: 0.9 },
  { id: 'xuancao',   name: '萱草',   layer: 'herb', hMin: 0.4,  hMax: 0.8, canopy: 0.4,  bloom: [0, 1, 0], bloomColor: '#ee9a3a', foliage: '#5f9448', moisture: 0.6, sun: 0.6 },
  { id: 'yuanwei',   name: '鸢尾',   layer: 'herb', hMin: 0.3,  hMax: 0.6, canopy: 0.35, bloom: [1, 0, 0], bloomColor: '#7d6fc4', foliage: '#4f8a52', moisture: 0.8, sun: 0.5 },
  { id: 'shegan',    name: '射干',   layer: 'herb', hMin: 0.4,  hMax: 0.9, canopy: 0.35, bloom: [0, 1, 0], bloomColor: '#e8843c', foliage: '#558a48', moisture: 0.5, sun: 0.7 },
  { id: 'qianqucai', name: '千屈菜', layer: 'herb', hMin: 0.5,  hMax: 1.0, canopy: 0.35, bloom: [0, 1, 1], bloomColor: '#c96fa8', foliage: '#5c9048', moisture: 0.9, sun: 0.7 }
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export function speciesOf(id) {
  return SPECIES_BY_ID[id];
}

export function bloomText(sp) {
  const parts = [];
  SEASONS.forEach((s, i) => {
    if (sp.bloom[i]) parts.push(SEASON_NAMES[s]);
  });
  return parts.length ? parts.join('、') : '无花';
}
