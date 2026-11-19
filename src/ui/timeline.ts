/**
 * Version timeline.
 *
 * Every explicit save appends an immutable snapshot. The list is the card's
 * history: click to select for diffing, star the keepers, restore any version
 * in place, or delete the noise.
 */

import { ZElement } from './base';
import {
  activeCard, deleteVersion, getState, renameVersion, restoreVersion, saveVersion,
  setDiff, setView, starVersion, subscribe,
} from '../store/state';

/** Keep in sync with diffview.ts. */
const CURRENT = '__current__';

export class VersionTimeline extends ZElement {
  private unsub: (() => void) | null = null;
  private renaming: string | null = null;

  protected override css(): string {
    return /* css */ `
    :host { display:flex; flex-direction:column; height:100%; background: var(--paper-2);
      border-right:1px solid var(--line); min-width:0; }
    header { padding:10px 12px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:6px; }
    header h2 { font-size:12px; letter-spacing:.05em; text-transform:uppercase; color:var(--ink-3);
      margin:0; flex:1; font-weight:600; }
    header button { font-size:12px; padding:4px 9px; }
    .list { flex:1; overflow:auto; scrollbar-width:thin; padding:6px; display:flex; flex-direction:column; gap:4px; }
    .v { display:grid; grid-template-columns: 14px 1fr auto; gap:7px; align-items:center;
      padding:6px 8px; border-radius:8px; border:1px solid transparent; cursor:pointer; }
    .v:hover { background: var(--paper-3); }
    .v[data-a=true] { border-color: #2f9e6e; background: #e7f6ee; }
    .v[data-b=true] { border-color: #cc5a4b; background: #fdecea; }
    .dot { width:8px; height:8px; margin-left:3px; border-radius:50%; background: var(--line-strong);
      position:relative; }
    .v[data-a=true] .dot { background:#2f9e6e; }
    .v[data-b=true] .dot { background:#cc5a4b; }
    .dot::before { content:""; position:absolute; left:50%; top:-9px; width:1px; height:6px; background:var(--line); }
    .v:first-child .dot::before { display:none; }
    .label { font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .label input { width:100%; font:inherit; border:1px solid var(--accent); border-radius:4px; padding:0 3px; background:var(--paper); }
    .time { font: 10.5px var(--mono); color: var(--ink-3); text-align:right; }
    .acts { display:flex; gap:2px; opacity:0; transition:opacity .12s; }
    .v:hover .acts { opacity:1; }
    .acts button { padding:1px 4px; font-size:11px; border:none; background:transparent; border-radius:4px; }
    .acts button:hover { background: var(--paper-2); }
    .acts .star.on { color: var(--gold); }
    .empty { padding:26px 16px; text-align:center; color:var(--ink-3); font-size:12px; line-height:1.7; }
    .compare { border-top:1px solid var(--line); padding:8px 10px; display:flex; flex-direction:column; gap:6px; }
    .pair { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--ink-2); }
    .tagA { background:#2f9e6e; color:#fff; border-radius:4px; padding:1px 5px; font-size:10.5px; }
    .tagB { background:#cc5a4b; color:#fff; border-radius:4px; padding:1px 5px; font-size:10.5px; }
    .pair b { font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .compare .row { display:flex; gap:6px; }
    .compare button { flex:1; font-size:12px; padding:4px; }
    .swatches { display:flex; gap:10px; font:11px var(--sans); color:var(--ink-2); align-items:center; }
    .swatch { display:flex; align-items:center; gap:4px; }
    .chip { width:10px; height:10px; border-radius:3px; }
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
    const list = [...(getState().versions[card.id] ?? [])].reverse();
    const diff = getState().diff;
    const a = list.find((v) => v.id === diff.a);
    const b = list.find((v) => v.id === diff.b);
    const canCompare = !!(a && b && a.id !== b.id);

    this.h(`
      <header>
        <h2>版本</h2>
        <button class="primary" data-act="save">存为新版本</button>
      </header>
      <div class="list">
        <div class="v" data-id="${CURRENT}" data-a="${diff.a === CURRENT}" data-b="${diff.b === CURRENT}"
             role="button" tabindex="0" title="当前画布上的状态">
          <span class="dot" aria-hidden="true"></span>
          <span class="label"><em style="font-style:normal;color:var(--accent)">当前编辑</em></span>
          <span class="time">${timeLabel(Date.now())}</span>
          <span class="acts"></span>
        </div>
        ${list.length === 0
          ? '<div class="empty">还没有版本。<br>每改一次就「存为新版本」，<br>之后可以并排比较差异。</div>'
          : list.map((v) => `
            <div class="v" data-id="${v.id}" data-a="${v.id === diff.a}" data-b="${v.id === diff.b}" role="button" tabindex="0">
              <span class="dot" aria-hidden="true"></span>
              <span class="label" title="${escapeAttr(v.label)}">${
                this.renaming === v.id
                  ? `<input class="rename" value="${escapeAttr(v.label)}" maxlength="18">`
                  : escapeHtml(v.label)
              }</span>
              <span class="time">${timeLabel(v.ts)}</span>
              <span class="acts">
                <button data-star="${v.id}" class="star ${v.starred ? 'on' : ''}" title="${v.starred ? '取消收藏' : '收藏'}">${v.starred ? '★' : '☆'}</button>
                <button data-restore="${v.id}" title="回到这个版本">↺</button>
                <button data-rename="${v.id}" title="重命名">✎</button>
                <button data-del="${v.id}" title="删除">✕</button>
              </span>
            </div>`).join('')}
      </div>
      <div class="compare">
        <div class="pair"><span class="tagA">旧</span><b>${a ? escapeHtml(a.label) : '未选'}</b></div>
        <div class="pair"><span class="tagB">新</span><b>${b ? escapeHtml(b.label) : '未选'}</b></div>
        <div class="swatches">
          <span class="swatch"><span class="chip" style="background:#2f9e6e"></span>只在旧版</span>
          <span class="swatch"><span class="chip" style="background:#cc5a4b"></span>只在新版</span>
        </div>
        <div class="row">
          <button data-act="compare" ${canCompare ? '' : 'disabled'}>查看差异</button>
          <button data-act="swap" ${a || b ? '' : 'disabled'} title="交换新旧">⇄</button>
        </div>
      </div>
    `);

    const q = (s: string) => this.q<HTMLElement>(s);

    q('[data-act="save"]')?.addEventListener('click', () => void saveVersion());

    this.qa<HTMLElement>('.v').forEach((row) => {
      row.addEventListener('click', (ev) => {
        const target = ev.target as HTMLElement;
        if (target.closest('.acts')) return;
        if (target.classList.contains('rename')) return;
        const id = row.getAttribute('data-id')!;
        // Plain click fills A; shift-click fills B; both clicks alternate.
        const cur = getState().diff;
        if (cur.a === id) {
          setDiff(cur.b === id ? null : cur.b, null);
          return;
        }
        if (!cur.a) setDiff(id, cur.b);
        else if (!cur.b) {
          if (id === cur.a) return;
          // Keep chronological order: older is A.
          if (id === CURRENT) { setDiff(cur.a, CURRENT); return; }
          const listArr = getState().versions[card.id] ?? [];
          const ai = listArr.findIndex((v) => v.id === cur.a);
          const bi = listArr.findIndex((v) => v.id === id);
          if (ai <= bi) setDiff(cur.a, id);
          else setDiff(id, cur.a);
        } else {
          setDiff(id, cur.b);
        }
      });
      row.addEventListener('dblclick', (ev) => {
        const target = ev.target as HTMLElement;
        if (target.closest('.acts')) return;
        const id = row.getAttribute('data-id')!;
        void restoreVersion(id);
      });
    });

    this.qa<HTMLElement>('[data-star]').forEach((b) =>
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        void starVersion(b.getAttribute('data-star')!);
      }));
    this.qa<HTMLElement>('[data-restore]').forEach((b) =>
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        void restoreVersion(b.getAttribute('data-restore')!);
      }));
    this.qa<HTMLElement>('[data-del]').forEach((b) =>
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        void deleteVersion(b.getAttribute('data-del')!);
      }));
    this.qa<HTMLElement>('[data-rename]').forEach((b) =>
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.renaming = b.getAttribute('data-rename')!;
        this.render();
        const input = this.q<HTMLInputElement>('.rename');
        if (input) {
          input.focus();
          input.select();
          const commit = () => {
            const v = input.value.trim();
            this.renaming = null;
            if (v) void renameVersion(b.getAttribute('data-rename')!, v);
            else this.render();
          };
          input.addEventListener('blur', commit, { once: true });
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { this.renaming = null; this.render(); }
          });
        }
      }));

    q('[data-act="compare"]')?.addEventListener('click', () => setView('diff'));
    q('[data-act="swap"]')?.addEventListener('click', () => {
      const cur = getState().diff;
      setDiff(cur.b, cur.a);
    });
  }
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function defineTimeline(): void {
  if (!customElements.get('version-timeline')) customElements.define('version-timeline', VersionTimeline);
}
