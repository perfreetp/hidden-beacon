/**
 * 右下角缩略球：d3.geoOrthographic 绘制球面，叠加视口轮廓与热点。
 * 点击球面任意位置把视口转过去；拖动球面可连续旋转。
 */
import { For, Show, createMemo, createSignal } from 'solid-js';
import * as d3 from 'd3-geo';
import type { Editor } from '../state/editor';
import { cameraBasis, clampLat, dot, lonLatToVec, viewPolygon, wrapLon } from '../lib/geo';

export interface MinimapProps {
  editor: Editor;
  size: number;
  /** 主视口的 CSS 像素尺寸，用于画视口轮廓 */
  viewport: { w: number; h: number };
  hotspots: { lon: number; lat: number; color: string; selected: boolean }[];
}

export function Minimap(props: MinimapProps) {
  const ed = props.editor;
  let svgRef!: SVGSVGElement;
  const [dragging, setDragging] = createSignal(false);

  const dim = () => props.size;
  const radius = () => dim() / 2 - 9;

  const projection = createMemo(() => {
    const c = ed.state.camera;
    return d3
      .geoOrthographic()
      .translate([dim() / 2, dim() / 2])
      .scale(radius())
      .rotate([-c.yaw, -c.pitch, 0])
      .clipAngle(90)
      .precision(0.6);
  });

  const graticule = d3.geoGraticule10();

  const graticulePath = createMemo(() => {
    const path = d3.geoPath(projection());
    return path(graticule) ?? '';
  });

  const viewportPath = createMemo(() => {
    const v = props.viewport;
    if (v.w < 2 || v.h < 2) return '';
    const poly = viewPolygon(ed.state.camera, v.w, v.h, 10);
    const path = d3.geoPath(projection());
    return (
      path({
        type: 'Polygon',
        coordinates: [poly.map((p) => [p.lon, p.lat])],
      } as unknown as d3.GeoPermissibleObjects) ?? ''
    );
  });

  const dots = createMemo(() => {
    const proj = projection();
    const forward = cameraBasis(ed.state.camera).forward;
    return props.hotspots
      .map((h) => {
        const p = proj([h.lon, h.lat]);
        if (!p) return null;
        return { ...h, x: p[0], y: p[1], facing: dot(lonLatToVec(h.lon, h.lat), forward) > 0 };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  });

  const northTick = createMemo(() => {
    const proj = projection();
    // 球心正上方“朝向天顶的切线方向”在屏幕上的角度
    const c = ed.state.camera;
    const center = proj([c.yaw, c.pitch]);
    const north = proj([c.yaw, clampLat(c.pitch + 20)]);
    if (!center || !north) return null;
    return { x: north[0], y: north[1] };
  });

  let dragStart: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;

  function local(e: PointerEvent) {
    const r = svgRef.getBoundingClientRect();
    const sx = dim() / Math.max(1, r.width);
    const sy = dim() / Math.max(1, r.height);
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  function onPointerDown(e: PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = local(e);
    if (Math.hypot(p.x - dim() / 2, p.y - dim() / 2) > radius() + 2) return;
    const c = ed.state.camera;
    dragStart = { x: p.x, y: p.y, yaw: c.yaw, pitch: c.pitch, moved: false };
    setDragging(true);
    const ll = invert(p.x, p.y);
    if (ll) ed.setCamera({ yaw: ll.lon, pitch: ll.lat });
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragStart) return;
    const p = local(e);
    const dx = p.x - dragStart.x;
    const dy = p.y - dragStart.y;
    if (!dragStart.moved && Math.hypot(dx, dy) < 3) return;
    dragStart.moved = true;
    const perPx = 180 / (Math.PI * radius());
    ed.setCamera({
      yaw: wrapLon(dragStart.yaw - dx * perPx),
      pitch: clampLat(dragStart.pitch + dy * perPx),
    });
  }

  function endPointer(e: PointerEvent) {
    dragStart = null;
    setDragging(false);
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }

  function invert(x: number, y: number): { lon: number; lat: number } | null {
    const inv = projection().invert?.([x, y]);
    if (!inv || !Number.isFinite(inv[0]) || !Number.isFinite(inv[1])) return null;
    return { lon: wrapLon(inv[0]), lat: clampLat(inv[1], 88.5) };
  }

  return (
    <div class="minimap" style={{ width: `${dim()}px` }}>
      <svg
        ref={svgRef}
        width={dim()}
        height={dim()}
        viewBox={`0 0 ${dim()} ${dim()}`}
        class={`minimap__svg${dragging() ? ' is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        role="application"
        aria-label="缩略球：点击任意位置移动视口"
        data-testid="minimap"
      >
        <defs>
          <radialGradient id="mm-globe" cx="36%" cy="30%" r="80%">
            <stop offset="0%" stop-color="#21453a" />
            <stop offset="62%" stop-color="#12261f" />
            <stop offset="100%" stop-color="#08120f" />
          </radialGradient>
          <clipPath id="mm-clip">
            <circle cx={dim() / 2} cy={dim() / 2} r={radius()} />
          </clipPath>
        </defs>
        <circle
          cx={dim() / 2}
          cy={dim() / 2}
          r={radius()}
          fill="url(#mm-globe)"
          stroke="rgba(150,225,190,0.3)"
          stroke-width={1}
        />
        <g clip-path="url(#mm-clip)">
          <path d={graticulePath()} class="minimap__graticule" />
          <path d={viewportPath()} class="minimap__viewport" data-testid="minimap-viewport" />
          <For each={dots()}>
            {(h) => (
              <circle
                cx={h.x}
                cy={h.y}
                r={h.selected ? 4.2 : 2.7}
                fill={h.facing ? h.color : 'rgba(180,215,200,0.32)'}
                stroke={h.selected ? '#ffffff' : 'none'}
                stroke-width={h.selected ? 1.1 : 0}
              />
            )}
          </For>
        </g>
        <g class="minimap__cross">
          <line x1={dim() / 2 - 5} y1={dim() / 2} x2={dim() / 2 + 5} y2={dim() / 2} />
          <line x1={dim() / 2} y1={dim() / 2 - 5} x2={dim() / 2} y2={dim() / 2 + 5} />
        </g>
        <Show when={northTick()}>
          {(n) => (
            <text x={n().x} y={n().y - 6} text-anchor="middle" class="minimap__north">
              北
            </text>
          )}
        </Show>
      </svg>
      <div class="minimap__caption">缩略球 · 点击移动视口</div>
    </div>
  );
}
