/**
 * 叠层视觉规范：热点图标的尺寸、字形、描边等。
 * 集中在一处，方便统一调整观感。
 */
import type { HotspotType } from './tour';

export const MARKER = {
  /** 基础直径（CSS px），随屏幕大小微调 */
  diameter: 34,
  /** 被选中时的外圈直径 */
  selectedRing: 46,
  /** 箭头热点的基础边长 */
  arrowSize: 40,
  /** 标签最大宽度 */
  labelMaxWidth: 168,
  /** 标签与小圆点之间的间距 */
  labelGap: 10,
  fontSize: 13,
  labelFontSize: 12.5,
  strokeWidth: 1.6,
  shadow: 'drop-shadow(0 2px 6px rgba(0,0,0,0.55))',
} as const;

export const FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Hiragino Sans GB", system-ui, sans-serif';

/** 每种热点的字形（24×24 的 SVG path，居中绘制） */
export const TYPE_GLYPH: Record<HotspotType, string> = {
  // 脚印 / 前进箭头
  nav: 'M12 4.2 L18.6 12.3 H14.7 V19.8 H9.3 V12.3 H5.4 Z',
  // 信息 i
  info: 'M12 3.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-2.2 6.2h4.4v10.6h-4.4z',
  // 标注：圆点+文字线
  label: 'M4.4 12a2.6 2.6 0 1 1 5.2 0 2.6 2.6 0 0 1-5.2 0Zm7.4-1.3h8v2.6h-8z',
  // 方向箭头（默认朝上）
  arrow: 'M12 2.6 L20.4 21 L12 16.7 L3.6 21 Z',
};

export const TYPE_NAME: Record<HotspotType, string> = {
  nav: '导航',
  info: '讲解',
  label: '标注',
  arrow: '箭头',
};

export const TYPE_HINT: Record<HotspotType, string> = {
  nav: '点击后淡入淡出跳转到另一张全景',
  info: '说明牌，可补充展项介绍文字',
  label: '独立文字标注，不响应点击跳转',
  arrow: '带罗盘朝向的指示箭头',
};

/** 缩放标尺：视野角越窄，图标略小一点，避免视觉上“糊住”画面 */
export function markerScale(fov: number): number {
  return 0.86 + 0.14 * Math.min(1, Math.max(0, (fov - 30) / 80));
}

/** 按字符宽度粗略截断（中英混排） */
export function truncateLabel(text: string, maxChars = 14): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}
