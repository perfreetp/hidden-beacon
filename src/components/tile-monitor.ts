export class TileMonitor extends HTMLElement {
  private list: HTMLDivElement;
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { position: absolute; right: 12px; bottom: 12px; width: 210px; }
        .panel {
          background: rgba(10, 14, 20, 0.62);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px; padding: 8px 12px;
          font-family: "Cascadia Mono", Consolas, monospace; font-size: 11px;
          color: #dfe8f5; backdrop-filter: blur(4px);
        }
        .title { color: #8fa3bd; margin-bottom: 4px; }
        .row { display: flex; justify-content: space-between; line-height: 1.6; }
        .row.slow { color: #ff5a5a; font-weight: bold; }
        .empty { color: #5c6f88; }
      </style>
      <div class="panel">
        <div class="title">瓦片加载监控(&gt;1.5s 标红)</div>
        <div id="list"><div class="empty">暂无加载记录</div></div>
      </div>
    `;
    this.list = root.getElementById('list') as HTMLDivElement;
  }
  add(id: string, ms: number, slow: boolean): void {
    const empty = this.list.querySelector('.empty');
    if (empty) empty.remove();
    const row = document.createElement('div');
    row.className = slow ? 'row slow' : 'row';
    const left = document.createElement('span');
    left.textContent = id;
    const right = document.createElement('span');
    right.textContent = `${ms.toFixed(0)} ms`;
    row.append(left, right);
    this.list.prepend(row);
    while (this.list.children.length > 14) this.list.lastElementChild!.remove();
  }
}
customElements.define('tile-monitor', TileMonitor);
