/**
 * Right-hand inspector: card, typography, effects, paper.
 *
 * Every control writes straight into the active card through `mutateCard`,
 * which coalesces saves. Rendered as one panel with collapsible sections so it
 * works on a laptop screen next to the stage.
 */

import { ZElement } from './base';
import {
  activeCard, getState, mutateCard, notify, subscribe, reshuffleBackground, resetStyle,
  addElement, removeSelected, selectElements, saveVersion, minGapOf,
} from '../store/state';
import { GLOW_PRESETS, PAPER_PRESETS, SHAPE_LABELS, CARD_SIZES, generateBlobs, defaultStyle } from '../model/defaults';
import type { Card, Element, GlyphElement, ShapeId, ShapeElement } from '../model/types';
import { uid, isGlyph } from '../model/types';
import { FONTS } from '../core/fonts';
import { glyphUnitRings, shapeUnitRings, clearSceneCaches } from '../core/scene';
import { layoutCard } from '../core/layout';

export class InspectorPanel extends ZElement {
  private collapsed = new Set<string>(['paper']);
  private unsub: (() => void) | null = null;

  protected override css(): string {
    return /* css */ `
    :host { display:flex; flex-direction:column; height:100%; background: var(--paper-2);
      border-left:1px solid var(--line); min-width:0; }
    header { padding:10px 12px 8px; border-bottom:1px solid var(--line); display:flex; gap:8px; align-items:center; }
    header input { flex:1; min-width:0; border:1px solid transparent; background:transparent; font-weight:600;
      font-size:14px; padding:4px 6px; border-radius:6px; }
    header input:hover { border-color: var(--line); }
    header input:focus { border-color: var(--accent); outline:none; background: var(--paper); }
    .body { flex:1; overflow:auto; scrollbar-width:thin; padding-bottom:24px; }
    section { border-bottom:1px solid var(--line); }
    section > summary { display:flex; align-items:center; gap:6px; cursor:pointer; padding:9px 12px;
      font-size:12px; font-weight:600; letter-spacing:.03em; color:var(--ink); list-style:none; user-select:none; }
    section > summary::-webkit-details-marker { display:none; }
    section > summary::before { content:"›"; display:inline-block; transition: transform .15s; color:var(--ink-3);
      font-size:14px; width:10px; }
    section[open] > summary::before { transform: rotate(90deg); }
    .inner { padding: 2px 12px 12px; display:flex; flex-direction:column; gap:9px; }
    .hint { font-size:11.5px; color:var(--ink-3); line-height:1.45; }
    .kv { display:flex; justify-content:space-between; font-size:11.5px; color:var(--ink-2); }
    .kv b { font-weight:600; color: var(--ink); font-family: var(--mono); }
    .row { display:flex; gap:6px; }
    .row > * { flex:1; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .empty { padding:18px 14px; text-align:center; color:var(--ink-3); font-size:12px; line-height:1.6; }
    .el-list { display:flex; flex-direction:column; gap:4px; }
    .el-item { display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:7px;
      border:1px solid var(--line); background: var(--paper); cursor:pointer; font-size:12px; }
    .el-item[aria-selected=true] { border-color: var(--accent); background: var(--accent-soft); }
    .el-item .glyph { font-family: var(--display); font-size:17px; width:22px; text-align:center; }
    .el-item .meta { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--ink-2); font-size:11px; }
    .chars { display:grid; grid-template-columns: repeat(6, 1fr); gap:4px; }
    .chars button { padding:6px 0; font-size:15px; font-family: var(--display); }
    .sep { height:1px; background: var(--line); margin:2px 0; }
    z-slider, z-swatches, z-color, z-toggle, z-segmented { display:block; }
    `;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.unsub = subscribe(() => this.render());
  }

  disconnectedCallback(): void {
    this.unsub?.();
  }

  protected override render(): void {
    const card = activeCard();
    if (!card) return;
    const sel = getState().selectedIds;
    const selEl = card.elements.find((e) => e.id === sel[0]) ?? null;
    const open = (id: string) => (this.collapsed.has(id) ? '' : 'open');

    this.h(`
      <header>
        <input class="title" value="${escapeAttr(card.title)}" aria-label="卡片标题" maxlength="24">
        <button class="ghost" data-act="version" title="保存为新版本">存为版本</button>
      </header>
      <div class="body">
        <section ${open('layout')}>
          <summary>尺寸与排布</summary>
          <div class="inner">
            <z-segmented data-key="size" label="卡片尺寸" options='${JSON.stringify(
              CARD_SIZES.map((s) => ({ value: s.id, label: s.name.replace(/ .*/, ''), title: s.name })),
            )}' value="${sizeId(card)}"></z-segmented>
            <div class="kv"><span>画布</span><b>${fmtN(card.w)} × ${fmtN(card.h)} mm</b></div>
            <z-slider data-key="clearance" label="字间距（描边外缘计）" min="0" max="18" step="0.5" unit="mm" value="${card.style.clearance}"></z-slider>
            <z-toggle data-key="optical" label="按字形重心光学居中" on="${card.style.opticalCenter}"></z-toggle>
            <div class="row">
              <button data-act="autolayout">距离场排布</button>
              <button data-act="center">居中</button>
            </div>
            <div class="kv"><span>当前最小字距</span><b data-min-gap>${gapLabel(card)}</b></div>
            <p class="hint">排布按真实字形轮廓计算，不受外接框影响；三个字时会自动选横排或三角。</p>
          </div>
        </section>

        <section ${open('type')}>
          <summary>文字</summary>
          <div class="inner">
            <z-segmented data-key="font" label="字体" options='${JSON.stringify(
              FONTS.map((f) => ({ value: f.id, label: f.name })),
            )}' value="${fontOf(card, selEl)}"></z-segmented>
            <div class="chars">
              ${'日月山水火心花草云天地人大小上中下'.split('').map((c) =>
                `<button data-char="${c}" title="添加「${c}」">${c}</button>`).join('')}
            </div>
            <div class="row">
              <input class="char-input" placeholder="输入任意字…" maxlength="4" aria-label="添加自定义字">
              <button data-act="add-char" style="flex:none">添加</button>
            </div>
            <div class="sep"></div>
            ${selEl && isGlyph(selEl) ? this.glyphEditor(selEl) : '<p class="hint">选中一个字可调整字号和倾斜。</p>'}
          </div>
        </section>

        <section ${open('fx')}>
          <summary>描边 · 发光 · 投影</summary>
          <div class="inner">
            <z-slider data-key="strokeWidth" label="描边粗细" min="0" max="4" step="0.05" unit="mm" value="${card.style.strokeWidth}"></z-slider>
            <z-color data-key="strokeColor" label="描边颜色" value="${card.style.strokeColor}"></z-color>
            <div class="sep"></div>
            <z-swatches data-key="glowPreset" label="发光颜色" value="${card.style.glowPresetId}"></z-swatches>
            <z-slider data-key="glowRadius" label="发光半径" min="0" max="12" step="0.1" unit="mm" value="${card.style.glowRadius}"></z-slider>
            <z-slider data-key="glowStrength" label="发光强度" min="0" max="1" step="0.01" value="${card.style.glowStrength}"></z-slider>
            <z-color data-key="glowColor" label="自定义发光色" value="${card.style.glowColor}"></z-color>
            <div class="sep"></div>
            <div class="grid2">
              <z-slider data-key="shadowX" label="投影 X" min="-8" max="8" step="0.1" unit="mm" value="${card.style.shadowX}"></z-slider>
              <z-slider data-key="shadowY" label="投影 Y" min="-8" max="8" step="0.1" unit="mm" value="${card.style.shadowY}"></z-slider>
            </div>
            <z-slider data-key="shadowBlur" label="投影柔化" min="0" max="8" step="0.05" unit="mm" value="${card.style.shadowBlur}"></z-slider>
            <z-slider data-key="shadowOpacity" label="投影浓度" min="0" max="1" step="0.01" value="${card.style.shadowOpacity}"></z-slider>
            <z-color data-key="shadowColor" label="投影颜色" value="${card.style.shadowColor}"></z-color>
            <button data-act="reset-fx">恢复默认效果</button>
          </div>
        </section>

        <section ${open('paper')}>
          <summary>底纹与图形</summary>
          <div class="inner">
            <z-segmented data-key="pattern" label="底纹" options='${JSON.stringify([
              { value: 'fused', label: '圆角融合' },
              { value: 'dots', label: '稀疏圆角' },
              { value: 'plain', label: '纯净' },
            ])}' value="${card.bg.pattern}"></z-segmented>
            <z-slider data-key="fusion" label="融合距离" min="0" max="24" step="0.5" unit="mm" value="${card.bg.fusion}"></z-slider>
            <z-slider data-key="radius" label="圆角半径" min="0" max="20" step="0.5" unit="mm" value="${card.bg.radius}"></z-slider>
            <z-swatches data-key="paper" label="纸张" value="${paperId(card)}"></z-swatches>
            <z-color data-key="bgInk" label="底纹颜色" value="${card.bg.ink}"></z-color>
            <z-toggle data-key="dots" label="纸面颗粒" on="${card.bg.dots}"></z-toggle>
            <z-toggle data-key="frame" label="内框" on="${card.bg.frame}"></z-toggle>
            <div class="row">
              <button data-act="reshuffle">换一组圆角</button>
              <button data-act="add-shape">加图形</button>
            </div>
            <p class="hint">圆角矩形之间的距离场用平滑并集合成，融合距离越大，靠近的形状越会连成一片。</p>
          </div>
        </section>

        <section ${open('elements')}>
          <summary>元素</summary>
          <div class="inner">
            ${card.elements.length === 0
              ? '<div class="empty">还没有元素。<br>从「文字」里点一个字开始。</div>'
              : `<div class="el-list">${card.elements.map((e) => elementRow(e, sel.includes(e.id))).join('')}</div>`}
            ${selEl ? this.selectionEditor(selEl) : ''}
          </div>
        </section>
      </div>
    `);

    this.bind(card, selEl);
  }

  private glyphEditor(el: GlyphElement): string {
    return `
      <div class="kv"><span>「${el.char}」</span><b>${el.size.toFixed(1)} mm</b></div>
      <z-slider data-el="size" label="字号" min="6" max="180" step="0.5" unit="mm" value="${el.size}"></z-slider>
      <z-slider data-el="tilt" label="倾斜" min="-30" max="30" step="0.5" unit="°" value="${el.tilt}"></z-slider>
    `;
  }

  private selectionEditor(el: Element): string {
    return `
      <div class="sep"></div>
      <z-color data-el="color" label="填充颜色" value="${el.color}"></z-color>
      ${el.type === 'shape' ? `
        <z-slider data-el="rot" label="旋转" min="-180" max="180" step="1" unit="°" value="${el.rotation}"></z-slider>
        <z-slider data-el="size" label="大小" min="4" max="160" step="0.5" unit="mm" value="${el.size}"></z-slider>
      ` : ''}
      <div class="row">
        <button data-act="front">置顶层</button>
        <button data-act="back">置底层</button>
        <button class="danger" data-act="remove">删除</button>
      </div>
    `;
  }

  private bind(card: Card, selEl: Element | null): void {
    // Title.
    const title = this.q<HTMLInputElement>('.title');
    title?.addEventListener('input', () => {
      mutateCard((c) => { c.title = title.value; }, { save: false });
    });
    title?.addEventListener('change', () => {
      mutateCard((c) => { c.title = title.value; });
    });

    // Glow swatches need their palette injected.
    const sw = this.q<HTMLElement & { setColors?: Function }>('z-swatches[data-key="glowPreset"]');
    if (sw && sw.setColors) {
      sw.setColors(GLOW_PRESETS.map((p) => ({ id: p.id, name: p.name, color: p.color })));
    }
    const paperSw = this.q<HTMLElement & { setColors?: Function }>('z-swatches[data-key="paper"]');
    if (paperSw && paperSw.setColors) {
      paperSw.setColors(PAPER_PRESETS.map((p) => ({ id: p.id, name: p.name, color: p.color })));
    }

    // Generic card-level controls.
    this.qa<HTMLElement>('[data-key]').forEach((ctl) => {
      const key = ctl.getAttribute('data-key')!;
      ctl.addEventListener('change', (ev: Event) => {
        const value = (ev as CustomEvent).detail?.value;
        this.applyCardControl(card, key, value);
      });
    });

    // Element-level controls.
    this.qa<HTMLElement>('[data-el]').forEach((ctl) => {
      const key = ctl.getAttribute('data-el')!;
      ctl.addEventListener('change', (ev: Event) => {
        const value = (ev as CustomEvent).detail?.value;
        const id = getState().selectedIds[0];
        if (!id) return;
        mutateCard((c) => {
          const el = c.elements.find((e) => e.id === id);
          if (!el) return;
          if (key === 'color') el.color = value;
          else if (key === 'size') el.size = Number(value);
          else if (key === 'tilt' && isGlyph(el)) el.tilt = Number(value);
          else if (key === 'rot' && el.type === 'shape') el.rotation = Number(value);
        });
        if (key === 'size' || key === 'tilt') this.refreshUnitGeometry();
      });
    });

    // Buttons.
    this.qa<HTMLElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => this.act(btn.getAttribute('data-act')!, card));
    });
    this.qa<HTMLElement>('[data-char]').forEach((btn) => {
      btn.addEventListener('click', () => this.addGlyph(btn.getAttribute('data-char')!));
    });
    const addChar = this.q<HTMLButtonElement>('[data-act="add-char"]');
    const input = this.q<HTMLInputElement>('.char-input');
    const doAdd = () => {
      const text = (input?.value ?? '').trim();
      if (!text) return;
      for (const ch of Array.from(text).slice(0, 4)) this.addGlyph(ch);
      if (input) input.value = '';
    };
    addChar?.addEventListener('click', doAdd);
    input?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') doAdd();
    });

    // Element list selection.
    this.qa<HTMLElement>('.el-item').forEach((row) => {
      row.addEventListener('click', (ev) => {
        const id = row.getAttribute('data-id')!;
        selectElements([id]);
        void ev;
      });
    });
    void selEl;
  }

  private applyCardControl(card: Card, key: string, value: unknown): void {
    const st = card.style;
    switch (key) {
      case 'size': {
        const s = CARD_SIZES.find((x) => x.id === value);
        if (!s) return;
        mutateCard((c) => {
          c.w = s.w;
          c.h = s.h;
          c.bg.blobs = generateBlobs(c.w, c.h, c.bg.seed, c.bg.pattern);
        });
        return;
      }
      case 'clearance':
        mutateCard((c) => { c.style.clearance = Number(value); });
        return;
      case 'optical':
        mutateCard((c) => { c.style.opticalCenter = Boolean(value); });
        return;
      case 'font': {
        mutateCard((c) => {
          c.elements.forEach((e) => { if (isGlyph(e)) e.fontId = String(value); });
        });
        this.refreshUnitGeometry();
        return;
      }
      case 'strokeWidth': st.strokeWidth = num(value); break;
      case 'strokeColor': st.strokeColor = String(value); break;
      case 'glowRadius': st.glowRadius = num(value); break;
      case 'glowStrength': st.glowStrength = num(value); break;
      case 'glowColor': st.glowColor = String(value); st.glowPresetId = 'custom'; break;
      case 'glowPreset': {
        const p = GLOW_PRESETS.find((x) => x.id === value);
        if (!p) return;
        st.glowPresetId = p.id;
        st.glowColor = p.color;
        break;
      }
      case 'shadowX': st.shadowX = num(value); break;
      case 'shadowY': st.shadowY = num(value); break;
      case 'shadowBlur': st.shadowBlur = num(value); break;
      case 'shadowOpacity': st.shadowOpacity = num(value); break;
      case 'shadowColor': st.shadowColor = String(value); break;
      case 'pattern': {
        mutateCard((c) => {
          c.bg.pattern = value as Card['bg']['pattern'];
          c.bg.blobs = generateBlobs(c.w, c.h, c.bg.seed, c.bg.pattern);
        });
        return;
      }
      case 'fusion': card.bg.fusion = num(value); break;
      case 'radius': {
        mutateCard((c) => {
          c.bg.radius = num(value);
          c.bg.blobs = c.bg.blobs.map((b) => ({ ...b, r: Math.min(num(value), Math.min(b.w, b.h) * 0.5) }));
        });
        return;
      }
      case 'paper': {
        const p = PAPER_PRESETS.find((x) => x.id === value);
        if (p) mutateCard((c) => { c.bg.paper = p.color; });
        return;
      }
      case 'bgInk': card.bg.ink = String(value); break;
      case 'dots': card.bg.dots = Boolean(value); break;
      case 'frame': card.bg.frame = Boolean(value); break;
      default:
        return;
    }
    mutateCard(() => {});
  }

  private async act(action: string, card: Card): Promise<void> {
    switch (action) {
      case 'version':
        await saveVersion();
        break;
      case 'autolayout': {
        this.dispatchEvent(new CustomEvent('request-autolayout', { bubbles: true, composed: true }));
        break;
      }
      case 'center':
        this.dispatchEvent(new CustomEvent('request-center', { bubbles: true, composed: true }));
        break;
      case 'reshuffle':
        reshuffleBackground();
        break;
      case 'reset-fx':
        resetStyle();
        break;
      case 'add-shape': {
        const shapes: ShapeId[] = ['circle', 'star', 'heart', 'cloud', 'flower', 'capsule'];
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        const el: ShapeElement = {
          id: uid('el'),
          type: 'shape',
          shape,
          x: card.w / 2,
          y: card.h * 0.22,
          size: Math.min(card.w, card.h) * 0.26,
          rotation: 0,
          color: '#ffd166',
          behind: true,
        };
        // Warm the unit outline before the element is added, so the first paint
        // already has geometry.
        shapeUnitRings(el.shape);
        addElement(el);
        notify({ status: `已添加${SHAPE_LABELS[shape]}` });
        break;
      }
      case 'front':
      case 'back': {
        const id = getState().selectedIds[0];
        if (!id) return;
        mutateCard((c) => {
          const el = c.elements.find((e) => e.id === id);
          if (!el) return;
          el.behind = action === 'back';
        });
        break;
      }
      case 'remove':
        removeSelected();
        break;
    }
  }

  private async addGlyph(ch: string): Promise<void> {
    const card = activeCard();
    if (!card) return;
    const glyphs = card.elements.filter(isGlyph);
    if (glyphs.length >= 6) {
      notify({ status: '一张卡片上最多放 6 个字，再多会影响可读性' });
      return;
    }
    const fontId = glyphs[0]?.fontId ?? FONTS[0].id;
    const el: GlyphElement = {
      id: uid('el'),
      type: 'glyph',
      char: ch,
      fontId,
      size: Math.min(card.w, card.h) * 0.5,
      tilt: 0,
      x: card.w / 2,
      y: card.h / 2,
      color: '#2f2620',
      behind: false,
    };
    await glyphUnitRings(fontId, ch);
    // Layout works from a common base size so every glyph on the card ends up
    // the same em size, regardless of how many times it has been re-laid out.
    const base = Math.min(card.w, card.h) * 0.5;
    mutateCard((c) => {
      for (const e of c.elements) if (isGlyph(e)) e.size = base;
      c.elements.push({ ...el, size: base });
    });
    const res = layoutCard(activeCard(), 'auto');
    if (res.positions.size > 0) {
      const uniform = base * res.sizeScale;
      mutateCard((c) => {
        for (const e of c.elements) {
          const p = res.positions.get(e.id);
          if (!p) continue;
          e.x = p.x;
          e.y = p.y;
          if (isGlyph(e)) e.size = uniform;
        }
      });
    }
    selectElements([el.id]);
    notify({ status: `已添加「${ch}」` });
  }

  private refreshUnitGeometry(): void {
    const card = activeCard();
    if (!card) return;
    // Unit rings are independent of size, but a font switch invalidates them.
    for (const e of card.elements) {
      if (isGlyph(e)) void glyphUnitRings(e.fontId, e.char);
      else shapeUnitRings(e.shape);
    }
    this.dispatchEvent(new CustomEvent('request-rerender', { bubbles: true, composed: true }));
  }
}

function elementRow(e: Element, selected: boolean): string {
  const label = e.type === 'glyph' ? e.char : SHAPE_LABELS[e.shape];
  const meta = e.type === 'glyph' ? `字 · ${e.size.toFixed(0)}mm` : `图形 · ${e.size.toFixed(0)}mm`;
  return `<div class="el-item" role="option" data-id="${e.id}" aria-selected="${selected}">` +
    `<span class="glyph">${e.type === 'glyph' ? label : '◆'}</span>` +
    `<span>${escapeHtml(label)}</span><span class="meta">${meta}</span></div>`;
}

function sizeId(card: Card): string {
  const m = CARD_SIZES.find((s) => s.w === card.w && s.h === card.h);
  return m?.id ?? 'custom';
}

function fontOf(card: Card, sel: Element | null): string {
  if (sel && isGlyph(sel)) return sel.fontId;
  const g = card.elements.find(isGlyph);
  return g && isGlyph(g) ? g.fontId : FONTS[0].id;
}

function paperId(card: Card): string {
  const m = PAPER_PRESETS.find((p) => p.color.toLowerCase() === card.bg.paper.toLowerCase());
  return m?.id ?? 'cream';
}

function gapLabel(card: Card): string {
  const g = minGapOf(card);
  return Number.isFinite(g) ? `${g.toFixed(1)} mm` : '—';
}

function fmtN(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function defineInspector(): void {
  if (!customElements.get('inspector-panel')) customElements.define('inspector-panel', InspectorPanel);
}

export { defaultStyle, clearSceneCaches };
