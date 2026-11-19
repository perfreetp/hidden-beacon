export class TerrainInspector extends HTMLElement {
  private pickEl: HTMLDivElement;
  private boxEl: HTMLDivElement;
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { position: absolute; left: 12px; bottom: 12px; max-width: 340px; }
        .panel {
          background: rgba(10, 14, 20, 0.62);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px; padding: 8px 12px; margin-top: 6px;
          font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px;
          color: #dfe8f5; line-height: 1.7; backdrop-filter: blur(4px);
        }
        .panel:empty { display: none; }
        .t { color: #7fd4ff; }
        .msg { color: #ffb35a; }
      </style>
      <div class="panel" id="pick"></div>
      <div class="panel" id="box"></div>
    `;
    this.pickEl = root.getElementById('pick') as HTMLDivElement;
    this.boxEl = root.getElementById('box') as HTMLDivElement;
  }
  setPick(html: string): void { this.pickEl.innerHTML = html; }
  setBox(html: string): void { this.boxEl.innerHTML = html; }
  message(text: string): void {
    this.pickEl.innerHTML = `<span class="msg">${text}</span>`;
  }
}
customElements.define('terrain-inspector', TerrainInspector);
