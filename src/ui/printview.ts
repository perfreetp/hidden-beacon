/**
 * Print and export page.
 *
 * Shows an A4 preview of the card set with the chosen ordering and cut marks,
 * and exposes the export controls. The preview is the same vector source that
 * the exporters use, so what is on screen is what comes out.
 */

import { ZElement } from './base';
import { getState, subscribe, activeCard } from '../store/state';
import { printPreviewSvg, exportCards, exportProjectJson, type ExportFormat } from '../export/exporter';
import { projectPayload } from '../store/state';
import type { Card } from '../model/types';

export class PrintView extends ZElement {
  private unsub: (() => void) | null = null;
  private dpi = 300;
  private format: ExportFormat = 'png';
  private cut = true;
  private includeAll = true;
  private perPage = 3;
  private busy = false;

  protected override css(): string {
    return /* css */ `
    :host { display:flex; height:100%; background: var(--paper); min-width:0; }
    .preview { flex:1; min-width:0; overflow:auto; padding:18px; display:flex; flex-direction:column;
      align-items:center; gap:12px; background: var(--paper-3); }
    .sheet { width:min(100%, 520px); aspect-ratio: 210 / 297; background:#fffefb;
      box-shadow: 0 14px 40px -18px rgba(60,42,20,.5); border-radius:3px; }
    .sheet svg { display:block; width:100%; height:100%; }
    aside { width:290px; flex:none; border-left:1px solid var(--line); background:var(--paper-2);
      padding:14px; display:flex; flex-direction:column; gap:12px; overflow:auto; }
    h2 { margin:0; font-size:13px; font-weight:600; }
    .group { display:flex; flex-direction:column; gap:6px; }
    .group > .t { font-size:11px; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); }
    .opts { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; }
    .opts button { font-size:12px; padding:5px 0; }
    .opts button[aria-pressed=true] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
    .field { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:12.5px; }
    .field select, .field input[type=number] { border:1px solid var(--line-strong); background:var(--paper);
      border-radius:6px; padding:3px 6px; font-size:12.5px; }
    button.primary { width:100%; padding:9px; font-size:13.5px; border-radius:9px; }
    .note { font-size:11.5px; color:var(--ink-3); line-height:1.6; }
    .stat { font:11px var(--mono); color:var(--ink-2); }
    .sep { height:1px; background:var(--line); }
    .row { display:flex; gap:6px; }
    .row button { flex:1; font-size:12px; }
    @media (max-width: 820px) { :host { flex-direction:column; } aside { width:auto; border-left:none; border-top:1px solid var(--line); }
      .preview { padding:10px; } }
    `;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.unsub = subscribe(() => this.render());
  }

  disconnectedCallback(): void {
    this.unsub?.();
  }

  private cardsToExport(): Card[] {
    const s = getState();
    return this.includeAll ? s.cards : [activeCard()];
  }

  protected override render(): void {
    const cards = this.cardsToExport();
    const active = activeCard();
    if (!active) return;
    const note = `A4 打印预览 · ${this.dpi} dpi 导出 · ${cards.length} 张`;
    const preview = printPreviewSvg(cards.slice(0, this.perPage), note);
    const pngW = Math.round((active.w * this.dpi) / 25.4);
    const pngH = Math.round((active.h * this.dpi) / 25.4);

    this.h(`
      <div class="preview">
        <div class="sheet">${preview}</div>
        <div class="stat">单张 ${active.w}×${active.h} mm · 导出 ${pngW}×${pngH} px</div>
      </div>
      <aside>
        <h2>导出高清卡片</h2>
        <div class="group">
          <span class="t">范围</span>
          <div class="row">
            <button data-scope="all" aria-pressed="${this.includeAll}">全部 ${getState().cards.length} 张</button>
            <button data-scope="one" aria-pressed="${!this.includeAll}">仅当前卡</button>
          </div>
        </div>
        <div class="group">
          <span class="t">格式</span>
          <div class="opts">
            <button data-fmt="png" aria-pressed="${this.format === 'png'}">PNG</button>
            <button data-fmt="svg" aria-pressed="${this.format === 'svg'}">SVG</button>
            <button data-fmt="pdf" aria-pressed="${this.format === 'pdf'}">PDF</button>
          </div>
        </div>
        ${this.format === 'png' ? `
          <div class="field"><span>分辨率</span>
            <select data-dpi>
              ${[300, 450, 600, 900, 1200].map((d) => `<option value="${d}" ${d === this.dpi ? 'selected' : ''}>${d} dpi</option>`).join('')}
            </select>
          </div>
          <div class="note">PNG 由矢量在导出时按目标分辨率栅格化，文字边缘不会因为放大而糊。</div>
        ` : this.format === 'pdf' ? `
          <div class="field"><span>每页张数</span>
            <select data-perpage>
              ${[2, 3, 4].map((n) => `<option value="${n}" ${n === this.perPage ? 'selected' : ''}>${n} 张</option>`).join('')}
            </select>
          </div>
          <div class="field"><span>裁切线</span>
            <input type="checkbox" data-cut ${this.cut ? 'checked' : ''}>
          </div>
          <div class="note">PDF 采用 A4 分页，每张卡片按真实毫米尺寸放置，可直接双面或单面打印后裁剪。</div>
        ` : `
          <div class="note">SVG 是纯矢量源文件，可用 Illustrator / Inkscape / Figma 打开继续编辑。</div>
        `}
        <div class="sep"></div>
        <button class="primary" data-act="export" ${this.busy ? 'disabled' : ''}>
          ${this.busy ? '正在导出…' : '导出'}
        </button>
        <div class="row">
          <button data-act="project">备份工程</button>
          <button data-act="print">系统打印</button>
        </div>
        <div class="sep"></div>
        <div class="note">
          所有卡片与版本都存在本机浏览器里（IndexedDB），不上传任何数据。
          导出的 SVG / PNG / PDF 可任意分发。
        </div>
      </aside>
    `);

    this.qa<HTMLElement>('[data-scope]').forEach((b) =>
      b.addEventListener('click', () => {
        this.includeAll = b.getAttribute('data-scope') === 'all';
        this.render();
      }));
    this.qa<HTMLElement>('[data-fmt]').forEach((b) =>
      b.addEventListener('click', () => {
        this.format = b.getAttribute('data-fmt') as ExportFormat;
        this.render();
      }));
    const dpiSel = this.q<HTMLSelectElement>('[data-dpi]');
    dpiSel?.addEventListener('change', () => {
      this.dpi = Number(dpiSel.value);
      this.render();
    });
    const perPage = this.q<HTMLSelectElement>('[data-perpage]');
    perPage?.addEventListener('change', () => {
      this.perPage = Number(perPage.value);
      this.render();
    });
    const cut = this.q<HTMLInputElement>('[data-cut]');
    cut?.addEventListener('change', () => { this.cut = cut.checked; });

    this.q('[data-act="export"]')?.addEventListener('click', () => void this.doExport());
    this.q('[data-act="project"]')?.addEventListener('click', () => exportProjectJson(projectPayload()));
    this.q('[data-act="print"]')?.addEventListener('click', () => window.print());
  }

  private async doExport(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      const cards = this.cardsToExport();
      const res = await exportCards({
        format: this.format,
        dpi: this.dpi,
        cards,
        perPage: this.perPage,
        cutMarks: this.cut,
      });
      this.dispatchEvent(new CustomEvent('toast', {
        bubbles: true,
        composed: true,
        detail: { message: `已导出 ${res.files} 张 · ${(res.bytes / 1024 / 1024).toFixed(1)} MB` },
      }));
    } catch (err) {
      this.dispatchEvent(new CustomEvent('toast', {
        bubbles: true,
        composed: true,
        detail: { message: `导出失败：${(err as Error).message}`, error: true },
      }));
    } finally {
      this.busy = false;
      this.render();
    }
  }
}

export function definePrintView(): void {
  if (!customElements.get('print-view')) customElements.define('print-view', PrintView);
}
