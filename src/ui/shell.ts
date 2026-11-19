/**
 * Application shell.
 *
 * Layout: a thin top bar, a card library rail, the stage, the inspector.
 * The stage owns zoom/pan and drag; everything else is a panel subscribed to
 * the store. Cross-panel commands travel as bubbling custom events so the shell
 * stays the only component that knows all of them.
 */

import { ZElement } from './base';
import {
  activeCard, createCard, duplicateCard, getState, initStore, mutateCard,
  notify, removeCard, saveVersion, selectElements, setActiveCard, setStatus, setView,
  subscribe, flushPendingSave, removeSelected,
} from '../store/state';
import { subscribe as sub } from '../store/state';
import { preloadFonts } from '../core/fonts';
import { glyphUnitRings, shapeUnitRings, clearSceneCaches, elementPath } from '../core/scene';
import { isGlyph, type Card, type GlyphElement } from '../model/types';
import type { CardStage } from './stage';
import type { AppState } from '../store/state';

export class AppShell extends ZElement {
  private unsub: (() => void) | null = null;
  private keyHandler: ((ev: KeyboardEvent) => void) | null = null;
  private ready = false;

  protected override css(): string {
    return /* css */ `
    :host { display:grid; height:100%; grid-template-rows: 46px minmax(0,1fr); grid-template-columns: 176px minmax(0,1fr) 306px;
      grid-template-areas: "top top top" "lib stage insp"; height:100%; background:var(--paper); }
    .top { grid-area: top; display:flex; align-items:center; gap:10px; padding:0 12px;
      border-bottom:1px solid var(--line); background:var(--paper-2); z-index:5; }
    .brand { font-family: var(--display); font-size:19px; letter-spacing:.01em; display:flex; align-items:baseline; gap:7px; }
    .brand small { font-family: var(--sans); font-size:10.5px; color:var(--ink-3); letter-spacing:.06em;
      text-transform:uppercase; }
    .tabs { display:flex; gap:2px; background:var(--paper-3); border-radius:8px; padding:2px; margin-left:10px; }
    .tabs button { border:none; background:transparent; padding:4px 12px; border-radius:6px; font-size:12.5px;
      color:var(--ink-2); }
    .tabs button[aria-selected=true] { background:var(--paper-2); color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.08); }
    .spacer { flex:1; }
    .status { font-size:11.5px; color:var(--ink-3); max-width:44vw; overflow:hidden; text-overflow:ellipsis;
      white-space:nowrap; }
    .save { font-size:12px; display:flex; align-items:center; gap:5px; color:var(--ink-3); }
    .save .dot { width:7px; height:7px; border-radius:50%; background: var(--accent-2); }
    .save.dirty .dot { background: var(--gold); }
    .lib { grid-area: lib; border-right:1px solid var(--line); background:var(--paper-2); display:flex;
      flex-direction:column; min-width:0; }
    .lib header { padding:8px 10px; display:flex; align-items:center; gap:6px; border-bottom:1px solid var(--line); }
    .lib header span { font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--ink-3); flex:1; }
    .cards { flex:1; overflow:auto; padding:8px; display:flex; flex-direction:column; gap:8px; scrollbar-width:thin; }
    .card { border:1px solid var(--line); border-radius:9px; overflow:hidden; background:var(--paper);
      cursor:pointer; transition:border-color .12s, box-shadow .12s; position:relative; }
    .card[aria-current=true] { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-soft); }
    .card .thumb { aspect-ratio: 5 / 7; display:grid; place-items:center; overflow:hidden; }
    .card .thumb svg { width:100%; height:100%; display:block; }
    .card .cap { font-size:11px; padding:4px 7px; color:var(--ink-2); display:flex; justify-content:space-between;
      gap:4px; border-top:1px solid var(--line); background:var(--paper-2); }
    .card .cap b { font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .card .acts { position:absolute; top:4px; right:4px; display:flex; gap:2px; opacity:0; transition:opacity .12s; }
    .card:hover .acts { opacity:1; }
    .card .acts button { padding:1px 5px; font-size:11px; border-radius:5px; background: color-mix(in srgb, var(--paper-2) 90%, transparent); }
    .lib footer { border-top:1px solid var(--line); padding:7px 8px; display:flex; gap:5px; }
    .lib footer button { flex:1; font-size:12px; }
    .stagewrap { grid-area: stage; min-width:0; min-height:0; padding:12px; }
    .vbar { height:36px; flex:none; border-top:1px solid var(--line); margin-top:8px; display:flex; align-items:center; padding:0 2px; }
    .stagewrap.diffmode, .stagewrap.printmode { padding:0; }
    .insp { grid-area: insp; min-width:0; }
    .toast { position:fixed; left:50%; bottom:26px; transform:translateX(-50%) translateY(8px); opacity:0;
      background:var(--ink); color:var(--paper); padding:8px 16px; border-radius:999px; font-size:12.5px;
      pointer-events:none; transition:opacity .18s, transform .18s; z-index:50; box-shadow:var(--shadow); }
    .toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
    .toast.err { background:var(--danger); color:#fff; }
    .booting { position:absolute; inset:0; display:grid; place-items:center; background:var(--paper);
      font-size:13px; color:var(--ink-3); z-index:9; }
    @media (max-width: 1100px) { :host { grid-template-columns: 148px 1fr 270px; } }
    @media (max-width: 900px) {
      :host { grid-template-columns: minmax(0,1fr) 268px; grid-template-rows: 46px minmax(0,1fr);
        grid-template-areas: "top top" "stage insp"; }
      .lib { display:none; }
      .tabs button { padding:4px 8px; }
      .brand small { display:none; }
      .stagewrap { padding:8px; }
      :host(.narrow) { grid-template-columns: minmax(0,1fr); grid-template-rows: 46px minmax(0,1fr) 46vh;
        grid-template-areas: "top" "stage" "insp"; }
      :host(.narrow) .insp { border-top:1px solid var(--line); border-left:none; min-height:0; }
    }
    @media (max-width: 640px) {
      .status { display:none; }
      .brand small { display:none; }
    }
    `;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.ready) return;
    this.ready = true;
    void this.boot();
  }

  disconnectedCallback(): void {
    this.unsub?.();
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    void flushPendingSave();
  }

  private async boot(): Promise<void> {
    this.h('<div class="booting">正在准备字体与距离场…</div>');
    await preloadFonts();
    await initStore();
    const state = getState();
    const card = activeCard();
    if (card) await this.warm(card);
    this.unsub = subscribe((s) => this.render(s));
    this.installKeys();
    this.installResponsive();
    this.render(state);
    // A first-version snapshot so the timeline is never empty on a fresh card.
    if ((getState().versions[card.id] ?? []).length === 0) {
      await saveVersion('初始');
    }
  }

  /** Pre-builds unit outlines for everything on a card. */
  private async warm(card: Card): Promise<void> {
    const jobs: Array<Promise<unknown>> = [];
    for (const el of card.elements) {
      if (isGlyph(el)) jobs.push(glyphUnitRings(el.fontId, el.char));
      else shapeUnitRings(el.shape);
    }
    await Promise.all(jobs);
  }

  /** Switches the narrow layout when the viewport cannot fit a side inspector. */
  private installResponsive(): void {
    const apply = () => {
      this.classList.toggle('narrow', window.innerWidth < 760);
    };
    apply();
    window.addEventListener('resize', apply);
  }

  private installKeys(): void {
    const handler = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        void saveVersion();
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (getState().selectedIds.length) {
          ev.preventDefault();
          removeSelected();
        }
        return;
      }
      if (ev.key === 'Escape') {
        selectElements([]);
        return;
      }
      if (ev.key === '0') {
        (this.q('card-stage') as unknown as CardStage | null)?.fit();
        return;
      }
      if (ev.key === '+' || ev.key === '=') {
        (this.q('card-stage') as unknown as CardStage | null)?.zoomBy(1.25);
        return;
      }
      if (ev.key === '-') {
        (this.q('card-stage') as unknown as CardStage | null)?.zoomBy(1 / 1.25);
        return;
      }
      // Arrow keys nudge the selection by 0.5 mm (shift = 2 mm).
      const dirs: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      const d = dirs[ev.key];
      if (d && getState().selectedIds.length) {
        ev.preventDefault();
        const step = ev.shiftKey ? 2 : 0.5;
        const ids = new Set(getState().selectedIds);
        mutateCard((card) => {
          for (const el of card.elements) {
            if (!ids.has(el.id)) continue;
            el.x += d[0] * step;
            el.y += d[1] * step;
          }
        });
        (this.q('card-stage') as unknown as CardStage | null)?.invalidateContent();
      }
    };
    this.keyHandler = handler;
    document.addEventListener('keydown', handler);
  }

  protected override render(s?: AppState): void {
    const state = s ?? getState();
    if (state.cards.length === 0) return;
    const card = activeCard();
    if (!card) return;

    if (!this.q('.top')) {
      this.h(`
        <div class="top">
          <div class="brand">识字卡 <small>SDF Studio</small></div>
          <div class="tabs" role="tablist">
            <button role="tab" data-view="edit">编辑</button>
            <button role="tab" data-view="diff">对比</button>
            <button role="tab" data-view="print">打印</button>
          </div>
          <div class="spacer"></div>
          <div class="status"></div>
          <div class="save"><span class="dot"></span><span class="txt"></span></div>
        </div>
        <div class="lib">
          <header><span>卡片</span><button class="ghost" data-act="new" title="新建卡片">＋</button></header>
          <div class="cards"></div>
          <footer>
            <button data-act="new">新建</button>
            <button data-act="dup">复制</button>
          </footer>
        </div>
        <div class="stagewrap"></div>
        <div class="insp"></div>
        <div class="toast" role="status" aria-live="polite"></div>
      `);
      this.bindShell();
    }

    // Tabs.
    this.qa<HTMLElement>('[data-view]').forEach((b) =>
      b.setAttribute('aria-selected', String(b.getAttribute('data-view') === state.view)));

    // Status.
    const statusEl = this.q('.status')!;
    statusEl.textContent = state.status || '';
    const saveEl = this.q('.save')!;
    saveEl.classList.toggle('dirty', state.dirty);
    this.q('.save .txt')!.textContent = state.dirty ? '未保存' : '已保存';

    // Library.
    const cardsEl = this.q('.cards')!;
    const libKey = state.cards.map((c) => `${c.id}:${c.updatedAt}:${c.title}`).join('|');
    if (this.q('.cards')?.getAttribute('data-key') !== libKey) {
      cardsEl.setAttribute('data-key', libKey);
      cardsEl.innerHTML = state.cards.map((c) => cardThumb(c, c.id === state.activeCardId)).join('');
      this.bindCards();
      void warmThumbnails(state.cards, () => {
        const fresh = getState();
        const rail = this.q('.cards');
        if (!rail) return;
        rail.innerHTML = fresh.cards.map((c) => cardThumb(c, c.id === fresh.activeCardId)).join('');
        this.bindCards();
      });
    }

    // Main pane.
    const wrap = this.q('.stagewrap') as HTMLElement;
    wrap.classList.toggle('diffmode', state.view === 'diff');
    wrap.classList.toggle('printmode', state.view === 'print');
    this.mountView(state.view);

    // Inspector (only in edit view).
    const insp = this.q('.insp') as HTMLElement;
    const needInspector = state.view === 'edit';
    if (needInspector && !insp.querySelector('inspector-panel')) {
      insp.innerHTML = '<inspector-panel style="height:100%"></inspector-panel>';
    } else if (!needInspector) {
      insp.innerHTML = '';
    }

    if (state.view === 'edit') {
      // The stage subscribes to the store itself; nudge it when the card changes.
      const stage = this.q('card-stage') as unknown as CardStage | null;
      if (stage) requestAnimationFrame(() => stage.invalidateContent());
    }
  }

  private mountView(view: AppState['view']): void {
    const wrap = this.q('.stagewrap');
    if (!wrap) return;
    const stage = this.q('card-stage');
    const needsStage = view === 'edit';
    if (needsStage) {
      if (!stage) {
        wrap.innerHTML =
          '<div style="display:flex;flex-direction:column;height:100%;min-height:0">' +
          '<card-stage style="display:block;flex:1;min-height:0"></card-stage>' +
          '<div class="vbar"><version-bar></version-bar></div>' +
          '</div>';
      }
      return;
    }
    if (view === 'diff') {
      if (!wrap.querySelector('diff-view')) {
        wrap.innerHTML =
          '<div style="display:grid;grid-template-columns:230px minmax(0,1fr);height:100%;width:100%">' +
          '<version-timeline style="display:flex"></version-timeline>' +
          '<diff-view style="display:flex"></diff-view>' +
          '</div>';
      }
    } else {
      if (!wrap.querySelector('print-view')) wrap.innerHTML = '<print-view style="height:100%;display:flex"></print-view>';
    }
  }

  private bindShell(): void {
    this.qa<HTMLElement>('[data-view]').forEach((b) =>
      b.addEventListener('click', () => setView(b.getAttribute('data-view') as AppState['view'])));
    this.qa<HTMLElement>('[data-act="new"]').forEach((b) =>
      b.addEventListener('click', async () => {
        await createCard(100, 140);
        const card = activeCard();
        await this.warm(card);
        setStatus('已新建卡片');
      }));
    this.q('[data-act="dup"]')?.addEventListener('click', async () => {
      await duplicateCard(getState().activeCardId);
      setStatus('已复制卡片');
    });

    this.addEventListener('request-autolayout', () => {
      (this.q('card-stage') as unknown as CardStage | null)?.autoLayout();
    });
    this.addEventListener('request-center', () => {
      (this.q('card-stage') as unknown as CardStage | null)?.centreSelection();
    });
    this.addEventListener('request-rerender', () => {
      const el = this.q('card-stage') as unknown as CardStage | null;
      el?.invalidateContent();
    });
    this.addEventListener('toast', (ev) => {
      const detail = (ev as CustomEvent).detail as { message: string; error?: boolean };
      this.toast(detail.message, !!detail.error);
    });
  }

  private bindCards(): void {
    this.qa<HTMLElement>('.card').forEach((node) => {
      const id = node.getAttribute('data-id')!;
      node.addEventListener('click', async (ev) => {
        if ((ev.target as HTMLElement).closest('.acts')) return;
        if (getState().activeCardId === id) return;
        await flushPendingSave();
        setActiveCard(id);
        clearSceneCaches();
        const card = activeCard();
        await this.warm(card);
        notify();
      });
      node.querySelector('[data-del]')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        void removeCard(id);
      });
      node.querySelector('[data-dup]')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        void duplicateCard(id);
      });
    });
  }

  private toast(message: string, error = false): void {
    const el = this.q('.toast');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('err', error);
    el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 2600);
  }
}

function cardThumb(card: Card, current: boolean): string {
  // A compact SVG made from the card body: shapes and glyphs only, no effects,
  // so the rail can render dozens of cards cheaply.
  const glyphs = card.elements.filter(isGlyph).map((e: GlyphElement) => e.char).join('');
  return `<div class="card" data-id="${card.id}" aria-current="${current}" role="button" tabindex="0">
    <div class="thumb">${thumbSvg(card)}</div>
    <div class="cap"><b>${escapeHtml(card.title)}</b><span>${escapeHtml(glyphs || '—')}</span></div>
    <div class="acts">
      <button data-dup title="复制">⧉</button>
      <button data-del title="删除">✕</button>
    </div>
  </div>`;
}

/**
 * Thumbnail: the element contours at card scale, drawn without effects.
 * Geometry is synchronous once the unit outlines are cached; cards whose fonts
 * have not been warmed yet show the paper and frame, then fill in on the next
 * render pass after warming.
 */
function thumbSvg(card: Card): string {
  const parts: string[] = [
    `<rect x="0" y="0" width="${card.w}" height="${card.h}" fill="${card.bg.paper}"/>`,
  ];
  if (card.bg.frame) {
    parts.push(
      `<rect x="${card.w * 0.045}" y="${card.h * 0.045}" width="${card.w * 0.91}" height="${card.h * 0.91}" ` +
      `rx="${Math.min(card.w, card.h) * 0.05}" fill="none" stroke="${card.bg.frameColor}" ` +
      `stroke-width="${Math.min(card.w, card.h) * 0.006}" opacity=".8"/>`,
    );
  }
  for (const el of card.elements) {
    const d = elementPath(el);
    if (!d) continue;
    parts.push(`<path d="${d}" fill="${el.color}" fill-rule="evenodd"/>`);
  }
  return `<svg viewBox="0 0 ${card.w} ${card.h}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}

/** Warms the geometry a thumbnail needs, without blocking the paint. */
async function warmThumbnails(cards: Card[], done: () => void): Promise<void> {
  const seen = new Set<string>();
  const jobs: Array<Promise<unknown>> = [];
  for (const card of cards) {
    for (const el of card.elements) {
      if (el.type !== 'glyph') continue;
      const key = `${el.fontId}:${el.char}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push(glyphUnitRings(el.fontId, el.char));
    }
  }
  if (jobs.length === 0) return;
  await Promise.all(jobs);
  done();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function defineShell(): void {
  if (!customElements.get('app-shell')) customElements.define('app-shell', AppShell);
}

export { sub };
