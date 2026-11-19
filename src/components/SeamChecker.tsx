/**
 * 立方体接缝检查器
 *
 * 把当前全景切成六面立方体贴图，在十字展开图上标出 12 条接缝的色差评分，
 * 点击接缝可看放大镜（两侧边条对比），并可把面图导出为 PNG。
 */
import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import type { Editor } from '../state/editor';
import {
  CUBE_FACES,
  EDGE_LABEL,
  FACE_BY_KEY,
  NET_LAYOUT,
  checkSeams,
  equirectSeamDiff,
  scoreFromSeams,
  seamColor,
  seamLoupe,
  splitEquirect,
  toImageData,
  type CubeEdgeInfo,
  type CubeFaceKey,
  type CubeResult,
  type FaceImage,
  type SeamReport,
} from '../lib/cubemap';
import { lonLatToCubeFace } from '../lib/cubemap';

interface Props {
  editor: Editor;
  onClose: () => void;
}

const FACE_SIZE_OPTIONS = [256, 384, 512];

export function SeamChecker(props: Props) {
  const ed = props.editor;
  const pano = () => ed.activePano();
  const [faceSize, setFaceSize] = createSignal(384);
  const [busy, setBusy] = createSignal(true);
  const [result, setResult] = createSignal<CubeResult | null>(null);
  const [sourceSeam, setSourceSeam] = createSignal<number | null>(null);
  const [selectedSeam, setSelectedSeam] = createSignal<string | null>(null);
  const [faceUrls, setFaceUrls] = createSignal<Partial<Record<CubeFaceKey, string>>>({});
  const [hoverInfo, setHoverInfo] = createSignal<{ face: CubeFaceKey; label: string } | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  let jobToken = 0;

  async function run() {
    const token = ++jobToken;
    const p = pano();
    if (!p) {
      setError('当前没有全景图');
      setBusy(false);
      return;
    }
    setBusy(true);
    setError(null);
    setSelectedSeam(null);
    try {
      const img = await loadImage(p.src);
      if (token !== jobToken) return;
      // 降采样到工作分辨率，兼顾速度与接缝判断精度
      const workW = Math.min(img.naturalWidth, 2048);
      const workH = Math.round((workW * img.naturalHeight) / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = workW;
      canvas.height = workH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, workW, workH);
      const src = ctx.getImageData(0, 0, workW, workH);
      const t0 = performance.now();
      const size = faceSize();
      const faces = splitEquirect(
        {
          width: workW,
          height: workH,
          sample(u, v) {
            const x = Math.min(workW - 1, Math.max(0, Math.round(u * (workW - 1))));
            const y = Math.min(workH - 1, Math.max(0, Math.round(v * (workH - 1))));
            const i = (y * workW + x) * 4;
            return [src.data[i], src.data[i + 1], src.data[i + 2]];
          },
        },
        size,
      );
      if (token !== jobToken) return;
      const report = checkSeams(faces);
      const worstMean = report.reduce((m, r) => Math.max(m, r.meanDiff), 0);
      const worstMax = report.reduce((m, r) => Math.max(m, r.maxDiff), 0);
      const score = scoreFromSeams(report);
      const seam = equirectSeamDiff({
        width: workW,
        height: workH,
        sample(u, v) {
          const x = Math.min(workW - 1, Math.max(0, Math.round(u * (workW - 1))));
          const y = Math.min(workH - 1, Math.max(0, Math.round(v * (workH - 1))));
          const i = (y * workW + x) * 4;
          return [src.data[i], src.data[i + 1], src.data[i + 2]];
        },
      });
      setSourceSeam(seam);
      setResult({ faces, size, report, worstMean, worstMax, score });
      void t0;
      // 生成面图 dataURL
      const urls: Partial<Record<CubeFaceKey, string>> = {};
      for (const f of CUBE_FACES) {
        urls[f.key] = faceToDataUrl(faces[f.key]);
      }
      setFaceUrls(urls);
      const worst = [...report].sort((a, b) => b.meanDiff - a.meanDiff)[0];
      setSelectedSeam(worst?.id ?? null);
    } catch (e) {
      setError(`切分失败：${(e as Error).message}`);
    } finally {
      if (token === jobToken) setBusy(false);
    }
  }

  onMount(run);

  const selectedReport = createMemo(() => {
    const r = result();
    if (!r) return null;
    return r.report.find((x) => x.id === selectedSeam()) ?? null;
  });

  const loupe = createMemo(() => {
    const r = result();
    const s = selectedReport();
    if (!r || !s) return null;
    const data = seamLoupe(r.faces, s, 9);
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    const buf = new Uint8ClampedArray(data.data.length);
    buf.set(data.data);
    const img = new ImageData(buf, data.width, data.height);
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    return { url: canvas.toDataURL('image/png'), width: data.width, height: data.height };
  });

  /** 热点在立方体上的落点，用于核对切面是否影响标注定位 */
  const hotspotFaces = createMemo(() => {
    const p = pano();
    if (!p) return [];
    return p.hotspots.map((h) => ({ h, face: lonLatToCubeFace(h.lon, h.lat).key }));
  });

  /**
   * 展开图中两个相邻面共享的边段（像素坐标）。
   * 十字展开时相邻面总在网格上紧挨着，直接取公共边界即可。
   */
  function sharedEdge(
    a: { col: number; row: number },
    b: { col: number; row: number },
    cellW: number,
    S: number,
  ): { x1: number; y1: number; x2: number; y2: number } | null {
    const ax = a.col * cellW;
    const ay = a.row * cellW;
    const bx = b.col * cellW;
    const by = b.row * cellW;
    if (a.row === b.row) {
      // 左右相邻
      const x = a.col < b.col ? ax + S : bx + S;
      return { x1: x, y1: ay, x2: x, y2: ay + S };
    }
    if (a.col === b.col) {
      // 上下相邻
      const y = a.row < b.row ? ay + S : by + S;
      return { x1: ax, y1: y, x2: ax + S, y2: y };
    }
    return null;
  }

  function faceToDataUrl(face: FaceImage): string {
    const canvas = document.createElement('canvas');
    canvas.width = face.size;
    canvas.height = face.size;
    canvas.getContext('2d')!.putImageData(toImageData(face.data), 0, 0);
    return canvas.toDataURL('image/png');
  }

  function downloadFacets() {
    const r = result();
    if (!r) return;
    for (const f of CUBE_FACES) {
      const url = faceUrls()[f.key];
      if (!url) continue;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(pano()?.fileName ?? pano()?.name ?? 'pano').replace(/\.[^.]+$/, '')}_${f.key}.png`;
      a.click();
    }
    ed.notify('已导出六张立方体面 PNG', 'ok');
  }

  function downloadReport() {
    const r = result();
    if (!r) return;
    const payload = {
      panorama: pano()?.name ?? '',
      faceSize: r.size,
      score: r.score,
      equirectSeamDiff: sourceSeam(),
      seams: r.report.map((x) => ({
        id: x.id,
        faces: [x.a, x.b],
        edges: [EDGE_LABEL[x.aEdge], EDGE_LABEL[x.bEdge]],
        meanDiff: Number(x.meanDiff.toFixed(3)),
        maxDiff: Number(x.maxDiff.toFixed(2)),
        excessRatio: Number(x.excessRatio.toFixed(2)),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `${pano()?.name ?? 'pano'}-seams.json`);
    ed.notify('已导出接缝报告', 'ok');
  }

  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal modal--wide" role="dialog" aria-modal="true" aria-label="立方体接缝检查">
        <header class="modal__head">
          <div>
            <h2>立方体接缝检查</h2>
            <p class="modal__sub">
              {pano()?.name ?? '未选择全景'} · 把等距柱状图重采样为六个 90° 立方体面，比对 12 条接缝两侧的颜色差
            </p>
          </div>
          <div class="modal__tools">
            <label class="mini-field mini-field--inline">
              <span>面分辨率</span>
              <select
                class="input input--sm"
                value={String(faceSize())}
                onChange={(e) => {
                  setFaceSize(Number(e.currentTarget.value));
                  setTimeout(run, 0);
                }}
              >
                <For each={FACE_SIZE_OPTIONS}>{(s) => <option value={String(s)}>{s}×{s}</option>}</For>
              </select>
            </label>
            <button class="btn btn--sm" onClick={run} disabled={busy()}>
              {busy() ? '计算中…' : '重新检查'}
            </button>
            <button class="btn btn--sm" onClick={downloadFacets} disabled={!result()}>
              导出六面 PNG
            </button>
            <button class="btn btn--sm" onClick={downloadReport} disabled={!result()}>
              导出报告
            </button>
            <button class="icon-btn" aria-label="关闭" onClick={props.onClose}>
              ×
            </button>
          </div>
        </header>

        <Show when={error()}>
          <div class="modal__error">{error()}</div>
        </Show>

        <div class="seam-body">
          <div class="seam-net">
            <Show when={result()} fallback={<div class="seam-loading">正在切分全景…</div>}>
              {(r) => {
                const S = 132;
                const gap = 4;
                const cellW = S + gap;
                return (
                  <svg
                    viewBox={`0 0 ${4 * cellW} ${3 * cellW}`}
                    class="seam-net__svg"
                    data-testid="cube-net"
                  >
                    <For each={NET_LAYOUT}>
                      {(cell) => {
                        const face = FACE_BY_KEY[cell.key];
                        const x = cell.col * cellW;
                        const y = cell.row * cellW;
                        return (
                          <g
                            onPointerEnter={() => setHoverInfo({ face: cell.key, label: face.label })}
                            onPointerLeave={() => setHoverInfo(null)}
                          >
                            <image
                              href={faceUrls()[cell.key]}
                              x={x}
                              y={y}
                              width={S}
                              height={S}
                              preserveAspectRatio="none"
                            />
                            <rect x={x} y={y} width={S} height={S} fill="none" stroke="rgba(255,255,255,0.16)" stroke-width={1} />
                            <text x={x + 7} y={y + 15} class="seam-net__label">
                              {face.label}
                            </text>
                            <text x={x + S - 7} y={y + S - 8} class="seam-net__count" text-anchor="end">
                              {hotspotFaces().filter((hf) => hf.face === cell.key).length || ''}
                            </text>
                          </g>
                        );
                      }}
                    </For>

                    {/* 接缝：在展开图上沿公共边着色 */}
                    <For each={r().report}>
                      {(rep) => {
                        const a = NET_LAYOUT.find((n) => n.key === rep.a)!;
                        const b = NET_LAYOUT.find((n) => n.key === rep.b)!;
                        const edge = sharedEdge(a, b, cellW, S);
                        if (!edge) return null;
                        const mx = (edge.x1 + edge.x2) / 2;
                        const my = (edge.y1 + edge.y2) / 2;
                        const active = () => selectedSeam() === rep.id;
                        return (
                          <g
                            class={`seam-hit${active() ? ' is-active' : ''}`}
                            onClick={() => setSelectedSeam(rep.id)}
                            onPointerEnter={() =>
                              setHoverInfo({ face: rep.a, label: `${FACE_BY_KEY[rep.a].label} ↔ ${FACE_BY_KEY[rep.b].label}` })
                            }
                          >
                            <line
                              x1={edge.x1}
                              y1={edge.y1}
                              x2={edge.x2}
                              y2={edge.y2}
                              stroke={seamColor(rep)}
                              stroke-width={active() ? 5 : 3}
                              stroke-linecap="round"
                            />
                            <line
                              x1={edge.x1}
                              y1={edge.y1}
                              x2={edge.x2}
                              y2={edge.y2}
                              stroke="transparent"
                              stroke-width={18}
                              stroke-linecap="round"
                            />
                            <circle
                              cx={mx}
                              cy={my}
                              r={active() ? 7 : 5}
                              fill={seamColor(rep)}
                              stroke="rgba(0,0,0,0.55)"
                              stroke-width={1}
                            />
                            <title>{`${FACE_BY_KEY[rep.a].label} ↔ ${FACE_BY_KEY[rep.b].label}：平均色差 ${rep.meanDiff.toFixed(2)}`}</title>
                          </g>
                        );
                      }}
                    </For>
                  </svg>
                );
              }}
            </Show>
            <p class="hint">
              圆点颜色代表该接缝的平均色差（绿＝连续，黄／橙＝轻微错位，红＝明显接缝）。点击查看放大镜。
              {hoverInfo() ? ` 当前：${hoverInfo()!.label}` : ''}
            </p>
          </div>

          <div class="seam-side">
            <Show when={result()} fallback={<div class="seam-loading">…</div>}>
              {(r) => (
                <>
                  <div class="score-card">
                    <div class={`score-ring score-ring--${r().score >= 85 ? 'good' : r().score >= 60 ? 'warn' : 'bad'}`}>
                      <span>{r().score}</span>
                      <small>接缝分</small>
                    </div>
                    <dl class="score-stats">
                      <div>
                        <dt>平均色差</dt>
                        <dd>{r().worstMean.toFixed(2)}</dd>
                      </div>
                      <div>
                        <dt>最大色差</dt>
                        <dd>{r().worstMax.toFixed(1)}</dd>
                      </div>
                      <div>
                        <dt>±180° 竖缝</dt>
                        <dd>{sourceSeam() === null ? '—' : sourceSeam()!.toFixed(1)}</dd>
                      </div>
                      <div>
                        <dt>接缝数</dt>
                        <dd>{r().report.length}</dd>
                      </div>
                    </dl>
                  </div>

                  <Show when={loupe()}>
                    {(l) => (
                      <figure class="loupe">
                        <div class="loupe__head">
                          <figcaption>
                            {selectedReport() ? `${EDGE_LABEL[selectedReport()!.aEdge]} · ${FACE_BY_KEY[selectedReport()!.a].label} ↔ ${FACE_BY_KEY[selectedReport()!.b].label}` : '—'}
                          </figcaption>
                          <span class="muted">
                            平均 {selectedReport()?.meanDiff.toFixed(2)} · 峰值 {selectedReport()?.maxDiff.toFixed(1)}
                          </span>
                        </div>
                        <img src={l().url} alt="接缝两侧边条放大对比" class="loupe__img" />
                        <div class="loupe__scale">
                          <span>左：{FACE_BY_KEY[selectedReport()?.a ?? 'pz'].label} 内侧 9px</span>
                          <span>右：{FACE_BY_KEY[selectedReport()?.b ?? 'px'].label} 内侧 9px</span>
                        </div>
                      </figure>
                    )}
                  </Show>

                  <div class="seam-table">
                    <table>
                      <thead>
                        <tr>
                          <th>接缝</th>
                          <th>平均</th>
                          <th>峰值</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={[...r().report].sort((a, b) => b.meanDiff - a.meanDiff)}>
                          {(x) => (
                            <tr
                              class={selectedSeam() === x.id ? 'is-active' : ''}
                              onClick={() => setSelectedSeam(x.id)}
                            >
                              <td>
                                <span class="seam-swatch" style={{ background: seamColor(x) }} />
                                {FACE_BY_KEY[x.a].label} ↔ {FACE_BY_KEY[x.b].label}
                              </td>
                              <td>{x.meanDiff.toFixed(2)}</td>
                              <td>{x.maxDiff.toFixed(1)}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>

                  <div class="seam-hotspots">
                    <h3>热点落面</h3>
                    <p class="hint">确认热点没有正好压在接缝线上；压线时在立方体贴图播放器中会略微偏移。</p>
                    <ul>
                      <For each={hotspotFaces().slice(0, 6)}>
                        {(hf) => (
                          <li>
                            <span class="hs-badge" style={{ background: ed.groupById(hf.h.groupId)?.color ?? '#7a8' }} />
                            {hf.h.label}
                            <span class="muted"> → {FACE_BY_KEY[hf.face].label}</span>
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show when={hotspotFaces().length > 6}>
                      <p class="hint">另有 {hotspotFaces().length - 6} 个热点…</p>
                    </Show>
                  </div>
                </>
              )}
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`无法加载 ${src}`));
    img.src = src;
  });
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
