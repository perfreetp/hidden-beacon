import { reactive } from 'vue';
import { bbox } from './geometry';

export const PALETTE = ['#f06292', '#aed581', '#ffd54f', '#4dd0e1', '#ba68c8', '#ff8a65'];

let bid = 1;

export const store = reactive({
  // 当前草图(草稿积木)的全部参数
  draft: {
    points: [], // 闭合轮廓顶点 [{x, y}],网格单位,y 向上
    closed: false,
    cornerMode: 'none', // none | chamfer | fillet
    cornerRadius: 0.4,
    revolve: false, // false=拉伸积木 true=回转体
    angle: 360, // 回转角度,15° 一档
    axisX: -4, // 旋转轴在草图里的 x 位置
    thickness: 1.5, // 拉伸厚度
  },
  draftPos: { x: 0, z: 0 }, // 草稿积木在地面上的位置
  blocks: [], // 复制出来的积木 {id, shape, x, z, color}
  selectedId: null, // 'draft' 或积木 id
  hasOverlap: false, // 是否有穿模
});

export function resetDraft() {
  store.draft.points = [];
  store.draft.closed = false;
}

export function addCopy() {
  const d = store.draft;
  if (!d.closed || d.points.length < 3) return;
  const shape = JSON.parse(
    JSON.stringify({
      points: d.points,
      cornerMode: d.cornerMode,
      cornerRadius: d.cornerRadius,
      revolve: d.revolve,
      angle: d.angle,
      axisX: d.axisX,
      thickness: d.thickness,
    })
  );
  const bb = bbox(d.points);
  const idx = store.blocks.length;
  const meshX = store.draftPos.x + (d.revolve ? d.axisX : 0);
  const x = meshX + bb.w + 2 + idx * 1.0;
  store.blocks.push({
    id: 'b' + bid++,
    shape,
    x,
    z: store.draftPos.z,
    color: PALETTE[idx % PALETTE.length],
  });
}

export function removeSelected() {
  const i = store.blocks.findIndex((b) => b.id === store.selectedId);
  if (i >= 0) store.blocks.splice(i, 1);
  store.selectedId = null;
}
