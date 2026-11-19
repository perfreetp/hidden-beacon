/**
 * 全景视图：canvas 球面渲染 + SVG 热点叠层 + 拖动/缩放/拖拽交互
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { Editor } from '../state/editor';
import type { Hotspot } from '../lib/tour';
import { SphereView, type PanoSource } from '../render/sphere';
import {
  Camera,
  DEG2RAD,
  clampFov,
  lerpCamera,
  rotationFromTo,
  rotateCamera,
  screenRay,
  screenToLonLat,
  formatLonLat,
  lonLatToVec,
  projectDir,
  wrapLon,
} from '../lib/geo';
import { hotspotView, nearViewport } from '../lib/visibility';
import { arrowScreenAngle, compassName, greatCircleSegments, polylinePath } from '../lib/overlay';
import { HotspotMarker } from './HotspotMarker';
import { MARKER, markerScale, truncateLabel } from '../lib/style';
import { Minimap } from './Minimap';

interface Props {
  editor: Editor;
  preview: boolean;
  onNavigate: (hotspot: Hotspot) => void;
}

interface DragState {
  kind: 'pan' | 'hotspot' | 'heading';
  pointerId: number;
  startX: number;
  startY: number;
  camera0: Camera;
  hotspotId?: string;
  hotspotStartLon?: number;
  hotspotStartLat?: number;
  moved: boolean;
  grab?: { x: number; y: number; z: number };
}

export function Viewport(props: Props) {
  const ed = props.editor;
  let wrapRef!: HTMLDivElement;
  let canvasRef!: HTMLCanvasElement;
  let svgRef!: SVGSVGElement;
  let view: SphereView | null = null;

  const [size, setSize] = createSignal({ w: 960, h: 600 });
  const [drag, setDrag] = createSignal<DragState | null>(null);
  const [hovered, setHovered] = createSignal<string | null>(null);
  const [renderWarning, setRenderWarning] = createSignal<string | null>(null);
  const [renderMode, setRenderMode] = createSignal<'webgl' | 'cpu'>('webgl');
  const [imageLoading, setImageLoading] = createSignal(false);
  const [imageError, setImageError] = createSignal(false);
  const [infoCard, setInfoCard] = createSignal<Hotspot | null>(null);
  const images = new Map<string, PanoSource>();
  const [imageVersion, setImageVersion] = createSignal(0);

  const cam = () => ed.state.camera;

  /* ---------- 生命周期 ---------- */
  onMount(() => {
    view = new SphereView(canvasRef, { maxTextureWidth: 4096 });
    if (view.error) setRenderWarning(view.error);
    setRenderMode(view.mode);
    const ro = new ResizeObserver(() => {
      const r = wrapRef.getBoundingClientRect();
      setSize({ w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) });
      view?.setSize(r.width, r.height, window.devicePixelRatio || 1);
    });
    ro.observe(wrapRef);
    const r = wrapRef.getBoundingClientRect();
    setSize({ w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) });
    view.setSize(r.width, r.height, window.devicePixelRatio || 1);
    view.setCamera(cam());
    onCleanup(() => {
      ro.disconnect();
      view?.dispose();
      view = null;
    });
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  // 相机 → 渲染器
  createEffect(() => {
    view?.setCamera(cam());
  });

  // 当前全景 → 渲染器
  createEffect(() => {
    const pano = ed.activePano();
    const src = pano?.src;
    if (!src || !view) return;
    let cancelled = false;
    const cached = images.get(src);
    if (cached) {
      view.setSource(cached);
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    setImageLoading(true);
    img
      .decode()
      .then(() => {
        if (cancelled) return;
        images.set(src, img);
        if (ed.activePano()?.src === src) {
          view?.setSource(img);
          setImageVersion((v) => v + 1);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (ed.activePano()?.src === src) setImageError(true);
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false);
      });
    onCleanup(() => {
      cancelled = true;
    });
  });

  const [lastActive, setLastActive] = createSignal('');
  createEffect(() => {
    const id = ed.state.activeId;
    if (id && id !== lastActive()) {
      setLastActive(id);
      setInfoCard(null);
      setImageError(false);
    }
  });

  /* ---------- 键盘 ---------- */
  function onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && /input|textarea|select/i.test(target.tagName)) return;
    const step = e.shiftKey ? 6 : 2;
    if (e.key === 'ArrowLeft') {
      ed.setCamera({ yaw: cam().yaw - step });
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      ed.setCamera({ yaw: cam().yaw + step });
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      ed.setCamera({ pitch: cam().pitch + step });
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      ed.setCamera({ pitch: cam().pitch - step });
      e.preventDefault();
    } else if (e.key === '+' || e.key === '=') {
      ed.setFov(cam().fov - 4);
    } else if (e.key === '-' || e.key === '_') {
      ed.setFov(cam().fov + 4);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (ed.state.selectedHotspotId) {
        ed.removeHotspot(ed.state.selectedHotspotId);
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      if (ed.state.pickingTargetFor) ed.setState('pickingTargetFor', null);
      else if (ed.state.dialog) ed.setState('dialog', null);
      else setInfoCard(null);
    }
  }

  /* ---------- 指针交互 ---------- */
  function localPoint(e: PointerEvent | WheelEvent | MouseEvent) {
    const r = svgRef.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onSurfacePointerDown(e: PointerEvent) {
    if (e.button === 2) return;
    const p = localPoint(e);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    // 取景模式：点击即确定导航目标落点
    if (ed.state.pickingTargetFor) {
      const ll = screenToLonLat(p.x, p.y, size().w, size().h, cam());
      const id = ed.state.pickingTargetFor;
      const h = ed.activePano()?.hotspots.find((x) => x.id === id);
      ed.setTarget(id, {
        panorama: h?.target?.panorama ?? '',
        lon: ll.lon,
        lat: ll.lat,
        fov: cam().fov,
        fadeMs: h?.target?.fadeMs ?? 700,
      });
      ed.setState('pickingTargetFor', null);
      ed.notify(`已选取落点 ${ll.lon.toFixed(1)}° / ${ll.lat.toFixed(1)}°`, 'ok');
      return;
    }
    const grabDir = screenRay(p.x, p.y, size().w, size().h, cam());
    setDrag({
      kind: 'pan',
      pointerId: e.pointerId,
      startX: p.x,
      startY: p.y,
      camera0: { ...cam() },
      moved: false,
      grab: grabDir,
    });
    svgRef.setPointerCapture?.(e.pointerId);
  }

  let lastHotspotMove = 0;
  let suppressClick = false;

  /** 所有 pointermove 都汇到这里，按 drag.kind 分派 */
  function onSurfacePointerMove(e: PointerEvent) {
    const d = drag();
    if (!d || d.pointerId !== e.pointerId) return;
    const p = localPoint(e);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 3) {
      d.moved = true;
      setDrag({ ...d });
      if (d.kind === 'hotspot') {
        try {
          svgRef.setPointerCapture(e.pointerId);
        } catch {
          /* 忽略 */
        }
      }
    }
    if (d.kind === 'pan') {
      const px = Math.min(size().w, Math.max(0, p.x));
      const py = Math.min(size().h, Math.max(0, p.y));
      const cur = screenRay(px, py, size().w, size().h, d.camera0);
      if (!d.grab) return;
      const rot = rotationFromTo(cur, d.grab);
      const next = rotateCamera(d.camera0, rot);
      ed.setCamera({ yaw: next.yaw, pitch: next.pitch });
    } else if (d.kind === 'hotspot' && d.hotspotId && d.moved) {
      // 把指针夹在视口内：边界位置直接取视口边界的球面坐标，
      // 这样热点贴边时经纬度精确可控，不会因为投影发散而乱飘。
      const x = Math.min(size().w - 0.5, Math.max(0.5, p.x));
      const y = Math.min(size().h - 0.5, Math.max(0.5, p.y));
      const ll = screenToLonLat(x, y, size().w, size().h, cam());
      if (!Number.isFinite(ll.lon) || !Number.isFinite(ll.lat)) return;
      const now = performance.now();
      if (now - lastHotspotMove < 8) return;
      lastHotspotMove = now;
      ed.dragHotspot(d.hotspotId, ll.lon, ll.lat);
    }
  }

  function onSurfacePointerUp(e: PointerEvent) {
    const d = drag();
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.kind === 'hotspot' && d.hotspotId && d.moved) {
      // 收尾时把最后一次指针位置精确应用（避免节流丢掉最后一帧）
      const p = localPoint(e);
      const x = Math.min(size().w - 0.5, Math.max(0.5, p.x));
      const y = Math.min(size().h - 0.5, Math.max(0.5, p.y));
      const ll = screenToLonLat(x, y, size().w, size().h, cam());
      if (Number.isFinite(ll.lon) && Number.isFinite(ll.lat)) {
        ed.dragHotspot(d.hotspotId, ll.lon, ll.lat);
      }
      ed.commitHotspotDrag(d.hotspotId, d.hotspotStartLon ?? 0, d.hotspotStartLat ?? 0);
      // 拖动后浏览器仍会补发一次 click，这里吞掉，避免误触发导航或信息卡
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    } else if (d.kind === 'pan' && !d.moved && ed.state.tool === 'hotspot') {
      const p = localPoint(e);
      const ll = screenToLonLat(p.x, p.y, size().w, size().h, cam());
      ed.addHotspot({ lon: ll.lon, lat: ll.lat, type: ed.state.newHotspotType });
      ed.setState('tool', 'select');
    } else if (d.kind === 'pan' && !d.moved) {
      ed.setState('selectedHotspotId', null);
      setInfoCard(null);
    }
    setDrag(null);
  }
  function onHotspotPointerDown(e: PointerEvent, h: Hotspot) {
    e.stopPropagation();
    if (ed.state.pickingTargetFor) return;
    if (ed.state.tool === 'hotspot') return;
    ed.setState('selectedHotspotId', h.id);
    setInfoCard(null);
    const p = localPoint(e);
    // 这里不立刻捕获指针：捕获会让浏览器跳过后续的 click 派发，
    // 单击导航/双击导航就失效了。等真正开始拖动时再捕获（见 onSurfacePointerMove）。
    setDrag({
      kind: 'hotspot',
      pointerId: e.pointerId,
      startX: p.x,
      startY: p.y,
      camera0: { ...cam() },
      hotspotId: h.id,
      hotspotStartLon: h.lon,
      hotspotStartLat: h.lat,
      moved: false,
    });
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = localPoint(e);
    const before = screenRay(p.x, p.y, size().w, size().h, cam());
    const factor = Math.exp(e.deltaY * 0.0012);
    const nextFov = clampFov(cam().fov * factor);
    if (nextFov === cam().fov) return;
    const nextCam: Camera = { ...cam(), fov: nextFov };
    // 以光标指向的球面点为锚点缩放：调整 yaw/pitch 使该点屏幕位置不变
    const afterDirSameScreen = anchorAdjust(cam(), nextCam, p.x, p.y, size().w, size().h, before);
    ed.setCamera(afterDirSameScreen);
  }

  /** 计算缩放后保持光标下球面点不动的新相机 */
  function anchorAdjust(
    oldCam: Camera,
    newCam: Camera,
    sx: number,
    sy: number,
    w: number,
    h: number,
    anchorDir: { x: number; y: number; z: number },
  ): Camera {
    // 新相机下该方向的屏幕位置
    const p = projectDir(anchorDir, newCam, w, h);
    if (!p.visible) return { ...newCam };
    const dx = sx - p.x;
    const dy = sy - p.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return { ...newCam };
    const cur = screenRay(p.x, p.y, w, h, newCam);
    const rot = rotationFromTo(cur, anchorDir);
    const adj = rotateCamera(newCam, rot);
    return { ...adj, fov: newCam.fov };
  }

  /* ---------- 计算绘制项 ---------- */
  /** 视口外的热点：在屏幕边缘显示指示箭头 */
  const offscreenMarkers = createMemo(() => {
    const s = size();
    const c = cam();
    const pano = ed.activePano();
    const out: { h: Hotspot; x: number; y: number; angle: number; color: string }[] = [];
    if (!pano) return out;
    for (const h of pano.hotspots) {
      if (!ed.isHotspotVisible(h)) continue;
      const v = hotspotView(h.lon, h.lat, c, s.w, s.h);
      if (v.visible && nearViewport(v, s.w, s.h, 24)) continue;
      // 用方向向量在屏幕上的极角决定贴边位置
      const dir = lonLatToVec(h.lon, h.lat);
      const p = projectDir(dir, c, s.w, s.h);
      let ax = 0;
      let ay = 0;
      if (p.visible) {
        ax = p.x - s.w / 2;
        ay = p.y - s.h / 2;
      } else {
        // 在背后：朝左右边缘
        ax = Math.sin((h.lon - c.yaw) * DEG2RAD) >= 0 ? 1 : -1;
        ay = 0.2;
      }
      const len = Math.hypot(ax, ay) || 1;
      const margin = 26;
      const halfW = s.w / 2 - margin;
      const halfH = s.h / 2 - margin;
      const scale = Math.min(halfW / Math.abs(ax || 1e-6), halfH / Math.abs(ay || 1e-6));
      const px = s.w / 2 + ax * scale;
      const py = s.h / 2 + ay * scale;
      out.push({
        h,
        x: px,
        y: py,
        angle: (Math.atan2(ax, -ay) * 180) / Math.PI,
        color: ed.groupById(h.groupId)?.color ?? '#5fd3a8',
      });
      void len;
    }
    return out;
  });

  const offCanvas = () => offscreenMarkers().length;

  const selected = () => ed.selectedHotspot();

  const targetLeader = createMemo(() => {
    const h = selected();
    if (!h || h.type !== 'nav' || !h.target) return null;
    if (h.target.panorama !== ed.state.activeId) return null;
    return { h, lon: h.target.lon, lat: h.target.lat };
  });

  const centerReading = createMemo(() => {
    const c = cam();
    return `${compassName(c.yaw)} ${Math.round(wrapLon(c.yaw) + 360) % 360}° · ${c.pitch >= 0 ? '仰' : '俯'} ${Math.abs(c.pitch).toFixed(0)}° · 视角 ${c.fov.toFixed(0)}°`;
  });

  function infoFor(h: Hotspot) {
    const g = ed.groupById(h.groupId);
    return { group: g?.name ?? '未分组', color: g?.color ?? '#5fd3a8' };
  }

  return (
    <div class="viewport" ref={wrapRef}>
      <canvas ref={canvasRef} class="viewport__canvas" />
      <div class="viewport__vignette" aria-hidden="true" />

      <svg
        ref={svgRef}
        class="viewport__svg"
        viewBox={`0 0 ${size().w} ${size().h}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        onPointerCancel={onSurfacePointerUp}
        onWheel={onWheel}
        onPointerLeave={() => setHovered(null)}
        style={{
          cursor: ed.state.pickingTargetFor
            ? 'crosshair'
            : drag()?.kind === 'pan'
              ? 'grabbing'
              : ed.state.tool === 'hotspot'
                ? 'crosshair'
                : 'grab',
        }}
      >
        <Show when={ed.state.showGrid}>
          <path d={gridLines(size().w, size().h)} class="grid-lines" />
        </Show>

        {/* 导航热点之间的虚线引导（显示在选中项） */}
        <Show when={targetLeader()}>
          {(t) => {
            const seg = () => {
              const s = size();
              const proj = (lon: number, lat: number) => {
                const p = projectDir(lonLatToVec(lon, lat), cam(), s.w, s.h);
                return { lon, lat, x: p.x, y: p.y, visible: p.visible };
              };
              return greatCircleSegments(
                { lon: t().h.lon, lat: t().h.lat },
                { lon: t().lon, lat: t().lat },
                proj,
                36,
              );
            };
            return (
              <g class="leader-lines">
                <For each={seg()}>{(pts) => <path d={polylinePath(pts)} class="leader-line" />}</For>
              </g>
            );
          }}
        </Show>

        {/* 已选热点的引导线 */}
        <For each={(ed.activePano()?.hotspots ?? []).filter((h) => h.showLeader && ed.isHotspotVisible(h))}>
          {(h) => {
            const segs = () => {
              const sz = size();
              const project = (lon: number, lat: number) => {
                const p = projectDir(lonLatToVec(lon, lat), cam(), sz.w, sz.h);
                return { lon, lat, x: p.x, y: p.y, visible: p.visible };
              };
              return greatCircleSegments({ lon: h.lon, lat: h.lat }, { lon: h.lon, lat: h.lat + 12 }, project, 10);
            };
            return (
              <g class="leader-lines">
                <For each={segs()}>{(pts) => <path d={polylinePath(pts)} class="leader-line leader-line--thin" />}</For>
              </g>
            );
          }}
        </For>

        {/* 热点：以热点对象为 key，相机变化时只改 transform，不重建节点，
            这样 pointerup 之后的 click / dblclick 才能正常派发 */}
        <For each={ed.activePano()?.hotspots ?? []}>
          {(h) => {
            const view = createMemo(() => {
              const sz = size();
              const v = hotspotView(h.lon, h.lat, cam(), sz.w, sz.h);
              return {
                ...v,
                near: nearViewport(v, sz.w, sz.h, 220),
                rotation: h.type === 'arrow' ? arrowScreenAngle(h.lon, h.lat, h.heading ?? 0, cam(), sz.w, sz.h) : 0,
              };
            });
            const shown = createMemo(() => ed.isHotspotVisible(h) && view().near);
            const color = () => ed.groupById(h.groupId)?.color ?? '#5fd3a8';
            const selected = () => ed.state.selectedHotspotId === h.id;
            const dimmed = () =>
              !!ed.state.selectedHotspotId && ed.state.selectedHotspotId !== h.id && h.type !== 'nav';
            return (
              <Show when={shown()}>
                <g
                  onPointerDown={(e) => onHotspotPointerDown(e, h)}
                  onPointerEnter={() => setHovered(h.id)}
                  onPointerLeave={() => setHovered((cur) => (cur === h.id ? null : cur))}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressClick) {
                      suppressClick = false;
                      return;
                    }
                    if (props.preview) {
                      if (h.type === 'nav') props.onNavigate(h);
                      else setInfoCard(h);
                    }
                  }}
                  onDblClick={(e) => {
                    e.stopPropagation();
                    if (h.type === 'nav') props.onNavigate(h);
                  }}
                  class="hotspot-hit"
                  data-hotspot-id={h.id}
                  data-type={h.type}
                >
                  <ellipse
                    cx={0}
                    cy={0}
                    rx={MARKER.diameter * markerScale(cam().fov) * 0.72}
                    ry={MARKER.diameter * markerScale(cam().fov) * 0.72}
                    fill="transparent"
                    transform={`translate(${view().x.toFixed(1)} ${view().y.toFixed(1)})`}
                  />
                  <HotspotMarker
                    type={h.type}
                    color={color()}
                    x={view().x}
                    y={view().y}
                    scale={markerScale(cam().fov)}
                    rotation={view().rotation}
                    selected={selected()}
                    dimmed={dimmed()}
                    label={truncateLabel(h.label, 12)}
                    showLabel={h.type === 'label' || selected() || hovered() === h.id}
                    data-hotspot-id={h.id}
                  />
                  <Show when={selected() && h.type === 'arrow'}>
                    <ArrowHandle
                      x={view().x}
                      y={view().y}
                      angle={view().rotation}
                      color={color()}
                      hotspot={h}
                      editor={ed}
                    />
                  </Show>
                  <Show when={selected()}>
                    <SelectionChip
                      x={view().x}
                      y={view().y}
                      text={h.type === 'nav' ? '导航' : h.type === 'info' ? '讲解' : h.type === 'arrow' ? '箭头' : '标注'}
                      color={color()}
                    />
                  </Show>
                </g>
              </Show>
            );
          }}
        </For>

        {/* 视口外方向提示 */}
        <For each={offscreenMarkers()}>
          {(o) => (
            <g
              class="offscreen-chip"
              transform={`translate(${o.x.toFixed(1)} ${o.y.toFixed(1)}) rotate(${o.angle.toFixed(1)})`}
              onClick={(e) => {
                e.stopPropagation();
                ed.setCamera({ yaw: o.h.lon, pitch: o.h.lat });
              }}
            >
              <path d="M-7 -9 L8 0 L-7 9 Z" fill={o.color} opacity={0.9} />
              <circle r="15" fill="transparent" />
            </g>
          )}
        </For>

        {/* 取景十字线 */}
        <Show when={ed.state.pickingTargetFor}>
          <g class="picking-reticle">
            <line x1={size().w / 2 - 18} y1={size().h / 2} x2={size().w / 2 + 18} y2={size().h / 2} />
            <line x1={size().w / 2} y1={size().h / 2 - 18} x2={size().w / 2} y2={size().h / 2 + 18} />
            <circle cx={size().w / 2} cy={size().h / 2} r={26} />
          </g>
        </Show>
      </svg>

      {/* 顶部读数 */}
      <div class="viewport__hud" classList={{ 'is-hidden': props.preview }}>
        <div class="hud-pill">
          <span class="hud-dot" />
          {ed.activePano()?.name ?? '未选择全景'}
        </div>
        <div class="hud-readout">{centerReading()}</div>
        <Show when={offCanvas() > 0}>
          <div class="hud-pill hud-pill--muted">视口外 {offCanvas()} 个热点</div>
        </Show>
      </div>

      <Show when={drag()?.kind === 'hotspot' && drag()?.moved && selected()}>
        {(sel) => (
          <div class="drag-readout" aria-live="polite">
            <span class="drag-readout__dot" style={{ background: ed.groupById(sel().groupId)?.color ?? '#5fd3a8' }} />
            <span>{formatLonLat({ lon: sel().lon, lat: sel().lat }, 1)}</span>
            <span class="drag-readout__sep" />
            <span class="muted">{sel().label}</span>
          </div>
        )}
      </Show>

      <Show when={ed.state.pickingTargetFor}>
        <div class="pick-banner">
          <span>目标取景模式：点击画面确定落点</span>
          <button class="mini-btn" onClick={() => ed.setState('pickingTargetFor', null)}>
            取消 (Esc)
          </button>
        </div>
      </Show>

      <Show when={imageLoading() && !imageError()}>
        <div class="image-loading">
          <span class="spinner" />
          正在载入全景…
        </div>
      </Show>

      <Show when={imageError()}>
        <div class="image-error">
          <p>全景图加载失败</p>
          <small>{ed.activePano()?.src}</small>
          <p class="hint">如果是从 tour.json 导入，请确认图片文件名与 tour.json 在同一目录。</p>
        </div>
      </Show>

      <Show when={renderWarning()}>
        <div class="render-warning">{renderWarning()}</div>
      </Show>

      <Show when={!ed.activePano()}>
        <div class="viewport__empty">
          <h2>还没有全景图</h2>
          <p>导入一张 2:1 等距柱状全景图开始布置导览，或载入示例漫游。</p>
          <div class="empty-actions">
            <button class="btn btn--primary" onClick={() => ed.setState('dialog', 'import')}>
              导入全景图
            </button>
            <button class="btn" onClick={() => ed.setState('dialog', 'help')}>
              查看使用说明
            </button>
          </div>
        </div>
      </Show>

      {/* 预览模式下的信息卡 */}
      <Show when={props.preview && infoCard()}>
        {(h) => (
          <div class="info-card">
            <div class="info-card__head">
              <span class="info-card__dot" style={{ background: infoFor(h()).color }} />
              <strong>{h().label}</strong>
              <span class="info-card__group">{infoFor(h()).group}</span>
              <button class="icon-btn" aria-label="关闭" onClick={() => setInfoCard(null)}>
                ×
              </button>
            </div>
            <p>{h().description || '这个展项还没有填写介绍文字。'}</p>
            <Show when={h().type === 'nav'}>
              <button class="btn btn--primary btn--sm" onClick={() => props.onNavigate(h())}>
                前往下一处
              </button>
            </Show>
          </div>
        )}
      </Show>

      {/* 视角缩放 */}
      <div class="zoom-rail" role="group" aria-label="视野角度" classList={{ 'is-hidden': props.preview }}>
        <button class="zoom-btn" title="拉近（视野变窄）" onClick={() => ed.setFov(cam().fov - 5)}>
          ＋
        </button>
        <input
          class="zoom-slider"
          type="range"
          min="30"
          max="110"
          step="1"
          value={Math.round(cam().fov)}
          aria-label="视野角度"
          onInput={(e) => ed.setFov(Number(e.currentTarget.value))}
        />
        <button class="zoom-btn" title="推远（视野变宽）" onClick={() => ed.setFov(cam().fov + 5)}>
          －
        </button>
        <span class="zoom-value">{Math.round(cam().fov)}°</span>
      </div>

      {/* 缩略球 */}
      <Show when={ed.activePano()}>
        <Minimap
          editor={ed}
          size={ed.state.minimapSize}
          viewport={size()}
          hotspots={(ed.activePano()?.hotspots ?? [])
            .filter((h) => ed.isHotspotVisible(h))
            .map((h) => ({
              lon: h.lon,
              lat: h.lat,
              color: ed.groupById(h.groupId)?.color ?? '#5fd3a8',
              selected: ed.state.selectedHotspotId === h.id,
            }))}
        />
      </Show>

      <div class="viewport__corner" classList={{ 'is-hidden': props.preview }}>
        <span class="corner-label">{renderMode() === 'cpu' ? 'CPU 渲染' : 'GPU 渲染'}</span>
        <span class="corner-sep" />
        <span class="corner-label">拖动环视 · 滚轮缩放 · 双击导航</span>
      </div>
    </div>
  );
}

function gridLines(w: number, h: number): string {
  const parts: string[] = [];
  for (let i = 1; i < 3; i++) {
    parts.push(`M0 ${(h * i) / 3} H${w}`);
    parts.push(`M${(w * i) / 3} 0 V${h}`);
  }
  return parts.join(' ');
}

function ArrowHandle(props: {
  x: number;
  y: number;
  angle: number;
  color: string;
  hotspot: Hotspot;
  editor: Editor;
}) {
  const dist = 46;
  const hx = () => props.x + Math.sin((props.angle * Math.PI) / 180) * dist;
  const hy = () => props.y - Math.cos((props.angle * Math.PI) / 180) * dist;
  const [active, setActive] = createSignal(false);
  const [startHeading, setStartHeading] = createSignal(0);

  function onDown(e: PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setActive(true);
    setStartHeading(props.hotspot.heading ?? 0);
  }

  function onMove(e: PointerEvent) {
    if (!active()) return;
    e.stopPropagation();
    const svg = (e.currentTarget as SVGGElement).ownerSVGElement!;
    const r = svg.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const dScreen = Math.hypot(px - props.x, py - props.y);
    if (dScreen < 6) return;
    // 屏幕极角 → 罗盘朝向：屏幕向上 = 北（heading 0）
    let deg = (Math.atan2(px - props.x, props.y - py) * 180) / Math.PI;
    // 吸附到 5°，按住 Shift 吸附到 45°
    const step = e.shiftKey ? 45 : 5;
    deg = Math.round(deg / step) * step;
    props.editor.updateHotspot(props.hotspot.id, { heading: (deg + 360) % 360 }, { coalesce: `heading-${props.hotspot.id}` });
  }

  function onUp(e: PointerEvent) {
    if (!active()) return;
    setActive(false);
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    // 落一次撤销点
    const cur = props.hotspot.heading ?? 0;
    if (Math.abs(cur - startHeading()) > 0.01) {
      props.editor.updateHotspot(props.hotspot.id, { heading: startHeading() });
      props.editor.updateHotspot(props.hotspot.id, { heading: cur });
    }
  }

  return (
    <g
      class={`arrow-handle${active() ? ' is-dragging' : ''}`}
      transform={`translate(${hx().toFixed(1)} ${hy().toFixed(1)})`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDblClick={(e) => e.stopPropagation()}
      style={{ cursor: 'grab' }}
    >
      <line x1={0} y1={0} x2={props.x - hx()} y2={props.y - hy()} stroke={props.color} stroke-width={1.2} opacity={0.55} />
      <circle r={8.5} fill="transparent" />
      <circle r={7} fill="#0b1512" stroke={props.color} stroke-width={1.6} />
      <circle r={2.6} fill={props.color} />
      <title>拖动改变箭头朝向（Shift 吸附 45°）</title>
    </g>
  );
}

function SelectionChip(props: { x: number; y: number; text: string; color: string }) {
  return (
    <g transform={`translate(${props.x.toFixed(1)} ${(props.y + 40).toFixed(1)})`}>
      <rect x={-22} y={-9} width={44} height={18} rx={9} fill="rgba(8,16,14,0.8)" stroke={props.color} stroke-width={1} />
      <text text-anchor="middle" dominant-baseline="central" font-size="10" fill={props.color} font-weight={600}>
        {props.text}
      </text>
    </g>
  );
}
