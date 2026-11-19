/**
 * 热点图标的 SVG 组件集
 */
import { For, Show, createMemo } from 'solid-js';
import type { Hotspot, HotspotType } from '../lib/tour';
import { TYPE_GLYPH, MARKER } from '../lib/style';

export interface MarkerProps {
  type: HotspotType;
  color: string;
  x: number;
  y: number;
  scale: number;
  selected?: boolean;
  dimmed?: boolean;
  hovered?: boolean;
  /** 箭头专用：屏幕旋转角（度，0=朝上） */
  rotation?: number;
  label?: string;
  showLabel?: boolean;
  labelBelow?: boolean;
  badge?: string;
  class?: string;
  onPointerDown?: (e: PointerEvent) => void;
  onClick?: (e: MouseEvent) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onDblClick?: (e: MouseEvent) => void;
  /** 透传额外的 data-* 属性，便于测试与样式挂钩 */
  'data-hotspot-id'?: string;
  'data-type'?: string;
}

export function HotspotMarker(props: MarkerProps) {
  const size = () => MARKER.diameter * props.scale;
  const half = () => size() / 2;
  const opacity = () => (props.dimmed ? 0.35 : 1);
  const labelText = () => props.label ?? '';
  const showLabel = () => props.showLabel !== false && labelText().length > 0;

  return (
    <g
      class={`hotspot hotspot-${props.type} ${props.class ?? ''}`}
      data-type={props['data-type'] ?? props.type}
      data-hotspot-id={props['data-hotspot-id']}
      transform={`translate(${props.x.toFixed(1)} ${props.y.toFixed(1)})`}
      style={{ opacity: opacity() }}
      onPointerDown={props.onPointerDown}
      onClick={props.onClick}
      onDblClick={props.onDblClick}
      onPointerEnter={props.onPointerEnter}
      onPointerLeave={props.onPointerLeave}
      role="button"
      aria-label={`${props.type} ${props.label ?? ''}`}
    >
      <Show when={props.selected}>
        <circle r={half() + 7} fill="none" stroke={props.color} stroke-width={1.6} stroke-dasharray="3 4" opacity={0.9}>
          <animate attributeName="r" values={`${half() + 5};${half() + 9};${half() + 5}`} dur="2.4s" repeatCount="indefinite" />
        </circle>
      </Show>

      <Show
        when={props.type === 'arrow'}
        fallback={
          <>
            <circle
              r={half()}
              fill={props.color}
              stroke="rgba(6,14,12,0.6)"
              stroke-width={MARKER.strokeWidth}
              class="marker-disc"
              style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))' }}
            />
            <circle r={half() - 3.2} fill="none" stroke="rgba(255,255,255,0.28)" stroke-width={1} />
            <g transform={`translate(${-half()} ${-half()}) scale(${size() / 24})`}>
              <path d={TYPE_GLYPH[props.type]} fill="rgba(8,18,15,0.82)" />
            </g>
            <Show when={props.badge}>
              <g transform={`translate(${half() * 0.72} ${-half() * 0.78})`}>
                <circle r={7.2} fill="#101a18" stroke={props.color} stroke-width={1.2} />
                <text text-anchor="middle" dominant-baseline="central" font-size="9" fill={props.color} font-weight="600">
                  {props.badge}
                </text>
              </g>
            </Show>
          </>
        }
      >
        <g transform={`rotate(${(props.rotation ?? 0).toFixed(2)})`}>
          <g transform={`translate(${-MARKER.arrowSize / 2} ${-MARKER.arrowSize / 2}) scale(${(MARKER.arrowSize * props.scale) / 24})`}>
            <path
              d={TYPE_GLYPH.arrow}
              fill={props.color}
              stroke="rgba(6,14,12,0.65)"
              stroke-width={1.1}
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))' }}
            />
          </g>
        </g>
      </Show>

      <Show when={showLabel()}>
        <g
          class="hotspot-label"
          transform={
            props.type === 'arrow'
              ? `translate(0 ${half() + 6})`
              : `translate(${half() + MARKER.labelGap * 0.4} ${-half() - 4})`
          }
        >
          <LabelPlate text={labelText()} color={props.color} align={props.type === 'arrow' ? 'middle' : 'start'} />
        </g>
      </Show>
    </g>
  );
}

export function LabelPlate(props: { text: string; color: string; align: 'start' | 'middle' | 'end'; strong?: boolean }) {
  const width = () => {
    const units = Array.from(props.text).reduce((n, ch) => n + (/[一-龥]/.test(ch) ? 1 : 0.56), 0);
    return Math.min(MARKER.labelMaxWidth, 10 + units * MARKER.labelFontSize);
  };
  const x = () => (props.align === 'middle' ? -width() / 2 : props.align === 'end' ? -width() : 0);
  const textX = () => (props.align === 'middle' ? 0 : props.align === 'end' ? -6 : 6);
  return (
    <g>
      <rect
        x={x()}
        y={-11}
        width={width()}
        height={22}
        rx={6}
        fill="rgba(10,20,17,0.82)"
        stroke="rgba(255,255,255,0.14)"
        stroke-width={1}
      />
      <rect x={x()} y={-11} width={2.6} height={22} rx={1.3} fill={props.color} />
      <text
        x={textX()}
        y={0}
        dominant-baseline="central"
        text-anchor={props.align}
        font-size={`${MARKER.labelFontSize}`}
        font-weight={props.strong ? 600 : 500}
        fill="#eef7f2"
        style={{ 'pointer-events': 'none' }}
      >
        {props.text}
      </text>
    </g>
  );
}

/** 无热点时的空态提示 */
export function EmptyHint(props: { text: string; sub?: string }) {
  return (
    <div class="empty-hint">
      <div class="empty-hint__icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="46" height="46">
          <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 5" />
          <path d="M24 13v22M13 24h22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </div>
      <p>{props.text}</p>
      <Show when={props.sub}>
        <small>{props.sub}</small>
      </Show>
    </div>
  );
}
