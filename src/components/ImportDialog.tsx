import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Editor } from '../state/editor';
import { serializeTour } from '../lib/tour';
import { SAMPLE_PANOS, buildSampleTour } from '../lib/sampleTour';
import { triggerDownload } from './SeamChecker';
import { validateTour } from '../lib/tour';

interface Props {
  editor: Editor;
  onClose: () => void;
  mode: 'import' | 'export';
  onImportedFiles: (files: File[]) => Promise<void>;
}

export function ImportDialog(props: Props) {
  const ed = props.editor;
  const [dragging, setDragging] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [progress, setProgress] = createSignal('');
  const [importText, setImportText] = createSignal('');
  const [mode, setMode] = createSignal<'files' | 'json'>(props.mode === 'import' ? 'files' : 'json');

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const json = arr.find((f) => /\.json$/i.test(f.name));
    if (json) {
      const text = await json.text();
      setImportText(text);
      setMode('json');
      return;
    }
    setBusy(true);
    setProgress(`正在读取 ${arr.length} 个文件…`);
    try {
      await props.onImportedFiles(arr);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  function loadJson() {
    const ok = ed.loadTourJson(importText());
    if (ok) props.onClose();
  }

  function loadSample() {
    const tour = buildSampleTour(
      SAMPLE_PANOS.map((s) => ({
        id: s.id,
        name: s.name,
        src: s.src,
        fileName: s.fileName,
        width: 2048,
        height: 1024,
        initialView: { lon: 0, lat: 0, fov: 70 },
        hotspots: [],
      })),
    );
    const { tour: parsed, issues } = validateTour(JSON.parse(JSON.stringify(tour)));
    if (parsed) {
      ed.replaceTour(parsed);
      props.onClose();
      ed.notify(issues.length ? `已载入示例漫游（${issues.length} 条提示）` : '已载入示例漫游', 'ok');
    }
  }

  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={props.mode === 'export' ? '导出 tour.json' : '导入'}>
        <header class="modal__head">
          <div>
            <h2>{props.mode === 'export' ? '导出 tour.json' : '导入全景 / 漫游'}</h2>
            <p class="modal__sub">
              {props.mode === 'export'
                ? '包含每张全景的初始视角、全部热点坐标、分组与跳转目标。'
                : '支持一次拖入多张等距柱状全景图，或载入之前导出的 tour.json。'}
            </p>
          </div>
          <button class="icon-btn" aria-label="关闭" onClick={props.onClose}>
            ×
          </button>
        </header>

        <Show
          when={props.mode === 'import'}
          fallback={
            <ExportPanel editor={ed} onClose={props.onClose} />
          }
        >
          <div class="seg seg--wide import-tabs">
            <button class={`seg__btn${mode() === 'files' ? ' is-on' : ''}`} onClick={() => setMode('files')}>
              全景图片
            </button>
            <button class={`seg__btn${mode() === 'json' ? ' is-on' : ''}`} onClick={() => setMode('json')}>
              tour.json
            </button>
          </div>

          <Show when={mode() === 'files'}>
            <label
              class={`dropzone${dragging() ? ' is-drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files);
              }}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,.json"
                multiple
                class="visually-hidden"
                onChange={(e) => {
                  if (e.currentTarget.files?.length) void handleFiles(e.currentTarget.files);
                  e.currentTarget.value = '';
                }}
              />
              <div class="dropzone__art" aria-hidden="true">
                <svg viewBox="0 0 64 40" width="96" height="60">
                  <rect x="1" y="6" width="62" height="28" rx="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 5" />
                  <path d="M22 26 L30 16 L34 21 L39 13 L46 26 Z" fill="currentColor" opacity="0.65" />
                  <circle cx="42" cy="13" r="2.6" fill="currentColor" />
                </svg>
              </div>
              <strong>拖入全景图，或点击选择文件</strong>
              <span class="hint">建议 2:1 等距柱状图（例如 4096×2048），可一次导入多张</span>
            </label>
            <Show when={busy()}>
              <p class="progress">{progress()}</p>
            </Show>
            <div class="import-samples">
              <div class="import-samples__head">
                <span>或一键载入示例三场景</span>
                <button class="btn btn--sm btn--primary" onClick={loadSample}>
                  载入示例漫游
                </button>
              </div>
              <div class="import-samples__grid">
                <For each={SAMPLE_PANOS}>
                  {(s) => (
                    <figure>
                      <img src={s.src.replace('.png', '-preview.png')} alt={s.name} />
                      <figcaption>{s.name}</figcaption>
                    </figure>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={mode() === 'json'}>
            <textarea
              class="input input--mono json-area"
              rows={10}
              spellcheck={false}
              placeholder="粘贴 tour.json 内容…"
              value={importText()}
              onInput={(e) => setImportText(e.currentTarget.value)}
            />
            <Show when={ed.issues().length > 0}>
              <ul class="issue-list">
                <For each={ed.issues()}>
                  {(iss) => (
                    <li class={`issue issue--${iss.level}`}>
                      <span>{iss.level === 'error' ? '错误' : '提示'}</span>
                      <code>{iss.path}</code>
                      {iss.message}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <div class="modal__foot">
              <label class="btn btn--sm file-btn">
                选择 .json 文件
                <input
                  type="file"
                  accept="application/json,.json"
                  class="visually-hidden"
                  onChange={async (e) => {
                    const f = e.currentTarget.files?.[0];
                    if (f) setImportText(await f.text());
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <button class="btn btn--primary btn--sm" disabled={!importText().trim()} onClick={loadJson}>
                导入
              </button>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}

function ExportPanel(props: { editor: Editor; onClose: () => void }) {
  const ed = props.editor;
  const [includeIndex, setIncludeIndex] = createSignal(true);
  const [precision, setPrecision] = createSignal(2);
  const json = createMemo(() => serializeTour(ed.state.tour, { includeIndex: includeIndex(), precision: precision() }));
  const [copied, setCopied] = createSignal(false);

  const warned = () => ed.state.tour.panoramas.some((p) => p.hotspots.some((h) => h.type === 'nav' && !h.target));

  async function copy() {
    try {
      await navigator.clipboard.writeText(json());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      ed.notify('复制失败，请手动选择下方文本', 'warn');
    }
  }

  function download() {
    const blob = new Blob([json()], { type: 'application/json' });
    triggerDownload(blob, 'tour.json');
    ed.clearDirty();
    ed.notify('已导出 tour.json', 'ok');
  }

  function downloadAssets() {
    // 生成一个包含图片路径说明的清单，便于部署
    const manifest = {
      title: ed.state.tour.title,
      assets: ed.state.tour.panoramas.map((p) => ({
        panorama: p.id,
        name: p.name,
        fileName: p.fileName ?? p.src,
        src: p.src.startsWith('blob:') ? `(本地图片，请放到与 tour.json 同目录：${p.fileName ?? 'pano.jpg'})` : p.src,
        size: [p.width, p.height],
        equirect: Math.abs(p.width / p.height - 2) <= 0.04,
      })),
    };
    triggerDownload(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), 'assets.json');
  }

  return (
    <>
      <div class="export-bar">
        <label class="switch">
          <input type="checkbox" checked={includeIndex()} onChange={(e) => setIncludeIndex(e.currentTarget.checked)} />
          <span>附带统计索引</span>
        </label>
        <label class="mini-field mini-field--inline">
          <span>坐标精度</span>
          <select class="input input--sm" value={String(precision())} onChange={(e) => setPrecision(Number(e.currentTarget.value))}>
            <option value="1">0.1°</option>
            <option value="2">0.01°</option>
            <option value="3">0.001°</option>
          </select>
        </label>
        <span class="spacer" />
        <button class="btn btn--sm" onClick={copy}>
          {copied() ? '已复制' : '复制 JSON'}
        </button>
        <button class="btn btn--sm" onClick={downloadAssets}>
          资源清单
        </button>
        <button class="btn btn--primary btn--sm" onClick={download}>
          下载 tour.json
        </button>
      </div>
      <Show when={warned()}>
        <p class="notice notice--warn">有导航热点尚未指定目标全景，导出后点击不会跳转。</p>
      </Show>
      <Show when={ed.state.tour.panoramas.some((p) => p.src.startsWith('blob:'))}>
        <p class="notice">
          含 {ed.state.tour.panoramas.filter((p) => p.src.startsWith('blob:')).length} 张本地导入的图片：
          tour.json 里记录的是文件名，请把同名图片与 tour.json 放在同一目录部署。
        </p>
      </Show>
      <pre class="json-preview" data-testid="json-preview">
        {json()}
      </pre>
      <footer class="modal__foot">
        <span class="muted">
          {ed.state.tour.panoramas.length} 张全景 · {ed.state.tour.panoramas.reduce((n, p) => n + p.hotspots.length, 0)} 个热点
        </span>
        <button class="btn btn--sm" onClick={props.onClose}>
          关闭
        </button>
      </footer>
    </>
  );
}
