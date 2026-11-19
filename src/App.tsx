/**
 * 应用外壳：工具栏、预览模式、对话框、导入导出、撤销重做。
 */
import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { createEditor, type Editor } from './state/editor';
import { Viewport } from './components/Viewport';
import { Sidebar } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { SeamChecker, triggerDownload } from './components/SeamChecker';
import { ImportDialog } from './components/ImportDialog';
import { HelpDialog } from './components/HelpDialog';
import { createFader } from './lib/transition';
import { SAMPLE_PANOS, buildSampleTour } from './lib/sampleTour';
import { validateTour, type Hotspot, type PanoramaNode } from './lib/tour';
import { loadImage } from './lib/importFiles';

export function App() {
  const ed = createEditor();
  const fader = createFader();
  const [preview, setPreview] = createSignal(false);
  const [sidebarOpen, setSidebarOpen] = createSignal(true);
  const [inspectorOpen, setInspectorOpen] = createSignal(true);
  const [importing, setImporting] = createSignal(false);

  /* ---------- 导入图片 ---------- */
  async function importFiles(files: File[]) {
    const images: File[] = [];
    for (const f of files) {
      if (/^image\//.test(f.type)) images.push(f);
    }
    if (!images.length) {
      ed.notify('没有可导入的图片文件', 'warn');
      return;
    }
    setImporting(true);
    let added = 0;
    const warnings: string[] = [];
    for (const file of images) {
      try {
        const url = URL.createObjectURL(file);
        const img = await loadImage(url);
        if (Math.abs(img.naturalWidth / img.naturalHeight - 2) > 0.04) {
          warnings.push(`${file.name} 宽高比 ${(img.naturalWidth / img.naturalHeight).toFixed(2)}:1，不是标准 2:1`);
        }
        const id = ed.addPanorama({
          id: '',
          name: file.name.replace(/\.[^.]+$/, ''),
          src: url,
          fileName: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        added++;
        if (added === 1) ed.switchTo(id, false);
        void id;
      } catch (e) {
        warnings.push(`${file.name} 导入失败：${(e as Error).message}`);
      }
    }
    setImporting(false);
    if (added) {
      ed.notify(`已导入 ${added} 张全景`, 'ok');
      ed.setState('dialog', null);
    }
    if (warnings.length) {
      for (const w of warnings) console.warn('[导入]', w);
      ed.notify(warnings[0] + (warnings.length > 1 ? `（共 ${warnings.length} 条提示）` : ''), 'warn');
    }
  }

  /* ---------- 示例 ---------- */
  async function loadSample(which: string) {
    const chosen = which === '__all' ? SAMPLE_PANOS : SAMPLE_PANOS.filter((s) => s.id === `pano-${which}`);
    if (!chosen.length) return;
    const panos: PanoramaNode[] = [];
    for (const s of chosen) {
      const img = await loadImage(s.src);
      panos.push({
        id: s.id,
        name: s.name,
        src: s.src,
        fileName: s.fileName,
        width: img.naturalWidth,
        height: img.naturalHeight,
        initialView: { lon: 0, lat: 0, fov: 70 },
        hotspots: [],
      });
    }
    if (which === '__all') {
      const tour = buildSampleTour(panos);
      const { tour: parsed } = validateTour(JSON.parse(JSON.stringify(tour)));
      if (parsed) ed.replaceTour(parsed);
      ed.setState('dialog', null);
      ed.notify('已载入示例漫游：三张全景 + 热点与导航', 'ok');
      return;
    }
    // 单场景：加图并套用模板里该场景的热点。
    // 模板里的导航目标若指向不在本次导入中的全景，则清空目标，避免悬空引用。
    const full = buildSampleTour(
      SAMPLE_PANOS.map((sp) => ({
        id: sp.id,
        name: sp.name,
        src: sp.src,
        fileName: sp.fileName,
        width: 2048,
        height: 1024,
        initialView: { lon: 0, lat: 0, fov: 70 },
        hotspots: [],
      })),
    );
    const template = full.panoramas.find((p) => p.id === chosen[0].id);
    for (const p of panos) {
      const id = ed.addPanorama({
        id: ed.state.tour.panoramas.some((x) => x.id === p.id) ? `${p.id}-${Date.now()}` : p.id,
        name: p.name,
        src: p.src,
        fileName: p.fileName,
        width: p.width,
        height: p.height,
        initialView: template?.initialView ?? { lon: 0, lat: 0, fov: 70 },
      });
      if (template?.hotspots.length) {
        const imported = new Set(panos.map((x) => x.id));
        const list = template.hotspots.map((h) => {
          const copy = JSON.parse(JSON.stringify(h)) as typeof h;
          if (copy.type === 'nav' && (!copy.target || !imported.has(copy.target.panorama))) {
            // 只有同批导入的目标才保留跳转，其余降级为讲解点
            copy.type = 'info';
            delete copy.target;
          }
          return copy;
        });
        ed.addHotspotsBulk(id, list);
      }
      ed.switchTo(id, false);
    }
    ed.setState('dialog', null);
  }

  /* ---------- 导航切换（带淡入淡出） ---------- */
  function navigate(h: Hotspot) {
    const target = h.target;
    if (!target) {
      ed.notify('这个导航热点还没有设置目标全景', 'warn');
      return;
    }
    const pano = ed.state.tour.panoramas.find((p) => p.id === target.panorama);
    if (!pano) {
      ed.notify('目标全景不存在', 'warn');
      return;
    }
    const fadeMs = target.fadeMs ?? 700;
    void fader.crossfade(() => {
      ed.switchTo(pano.id, false);
      ed.setCamera({ yaw: target.lon, pitch: target.lat, fov: target.fov }, false);
    }, fadeMs);
  }

  /* ---------- 导出 ---------- */
  function quickExport() {
    ed.setState('dialog', 'export');
  }

  /* ---------- 快捷键 ---------- */
  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && /input|textarea|select/i.test(target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      ed.undo();
    } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      ed.redo();
    } else if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      quickExport();
    } else if (e.key === '`' || e.key === 'p') {
      if (!mod) setPreview((v) => !v);
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
    // 首次进入给一点引导
    if (!ed.state.tour.panoramas.length) {
      setTimeout(() => ed.setState('dialog', 'import'), 380);
    }
  });

  const activeName = () => ed.activePano()?.name ?? '未选择全景';
  const hotspotCount = () => ed.activePano()?.hotspots.length ?? 0;

  return (
    <div class={`app${preview() ? ' is-preview' : ''}`}>
      <header class="topbar">
        <div class="brand">
          <span class="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" width="22" height="22">
              <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" stroke-width="1.4" />
              <ellipse cx="14" cy="14" rx="6" ry="12" fill="none" stroke="currentColor" stroke-width="1" opacity="0.6" />
              <line x1="2" y1="14" x2="26" y2="14" stroke="currentColor" stroke-width="1" opacity="0.6" />
            </svg>
          </span>
          <div class="brand__text">
            <input
              class="brand__title"
              value={ed.state.tour.title}
              aria-label="漫游标题"
              onInput={(e) => ed.setDocMeta({ title: e.currentTarget.value })}
            />
            <span class="brand__sub">全景漫游编辑器 · 自然探索馆</span>
          </div>
        </div>

        <div class="topbar__center" aria-live="polite">
          <span class="crumb">{activeName()}</span>
          <span class="dot-sep">·</span>
          <span class="muted">{hotspotCount()} 个热点</span>
          <Show when={ed.dirty()}>
            <span class="dirty-dot" title="有未导出的修改" />
          </Show>
        </div>

        <div class="topbar__actions">
          <div class="btn-group">
            <button class="icon-btn" title="撤销 (Ctrl+Z)" disabled={!ed.canUndo()} onClick={() => ed.undo()}>
              ↶
            </button>
            <button class="icon-btn" title="重做 (Ctrl+Shift+Z)" disabled={!ed.canRedo()} onClick={() => ed.redo()}>
              ↷
            </button>
          </div>
          <button
            class={`btn btn--sm${preview() ? ' is-on' : ''}`}
            onClick={() => setPreview((v) => !v)}
            title="预览模式 (P)：隐藏编辑面板，模拟访客体验"
          >
            {preview() ? '退出预览' : '预览'}
          </button>
          <button class="btn btn--sm" onClick={() => ed.setState('dialog', 'import')}>
            导入
          </button>
          <button class="btn btn--sm" onClick={() => ed.setState('dialog', 'export')}>
            导出 tour.json
          </button>
          <button class="icon-btn" title="使用说明" onClick={() => ed.setState('dialog', 'help')}>
            ?
          </button>
        </div>
      </header>

      <main class="workspace">
        <Show when={!preview() && sidebarOpen()}>
          <Sidebar
            editor={ed}
            onImport={() => ed.setState('dialog', 'import')}
            onLoadSample={(n) => void loadSample(n)}
            onOpenSeam={() => ed.setState('dialog', 'seam')}
          />
        </Show>

        <section class="stage">
          <Viewport editor={ed} preview={preview()} onNavigate={navigate} />
          <div class="fader" style={{ opacity: String(fader.opacity()) }} aria-hidden="true" />
          <Show when={fader.busy()}>
            <div class="transition-badge">正在前往…</div>
          </Show>
          <Show when={importing()}>
            <div class="transition-badge">正在导入图片…</div>
          </Show>
        </section>

        <Show when={!preview() && inspectorOpen()}>
          <Inspector editor={ed} />
        </Show>
      </main>

      <footer class="statusbar">
        <div class="statusbar__left">
          <button class="icon-btn icon-btn--sm" title="折叠 / 展开左侧面板" onClick={() => setSidebarOpen((v) => !v)}>
            ☰
          </button>
          <span class="muted">
            {ed.state.tour.panoramas.length} 张全景 · {ed.state.tour.groups.length} 个分组 ·{' '}
            {ed.state.tour.panoramas.reduce((n, p) => n + p.hotspots.length, 0)} 个热点
          </span>
        </div>
        <div class="statusbar__right">
          <label class="switch">
            <input type="checkbox" checked={ed.state.showGrid} onChange={(e) => ed.setState('showGrid', e.currentTarget.checked)} />
            <span>网格</span>
          </label>
          <label class="switch">
            <input
              type="checkbox"
              checked={ed.state.tour.panoramas.some((p) => p.src)}
              disabled
              style={{ display: 'none' }}
            />
          </label>
          <span class="muted">滚轮缩放 · 拖动环视 · 双击热点导航</span>
        </div>
      </footer>

      <Show when={ed.state.toast}>
        {(t) => (
          <div class={`toast toast--${t().tone}`} role="status">
            {t().text}
          </div>
        )}
      </Show>

      <Show when={ed.state.dialog === 'seam'}>
        <SeamChecker editor={ed} onClose={() => ed.setState('dialog', null)} />
      </Show>
      <Show when={ed.state.dialog === 'import' || ed.state.dialog === 'export'}>
        <ImportDialog
          editor={ed}
          mode={ed.state.dialog === 'export' ? 'export' : 'import'}
          onClose={() => ed.setState('dialog', null)}
          onImportedFiles={importFiles}
        />
      </Show>
      <Show when={ed.state.dialog === 'help'}>
        <HelpDialog onClose={() => ed.setState('dialog', null)} />
      </Show>

      <Show when={preview()}>
        <div class="preview-hint">
          <span>预览模式</span>
          <button class="mini-btn" onClick={() => setPreview(false)}>
            退出 (P)
          </button>
        </div>
      </Show>
    </div>
  );
}

export { triggerDownload };
export type { Editor };
