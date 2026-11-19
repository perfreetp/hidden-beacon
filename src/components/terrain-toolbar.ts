export class TerrainToolbar extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { position: absolute; top: 12px; right: 12px; }
        .bar {
          display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
          background: rgba(10, 14, 20, 0.62);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px; padding: 8px 10px;
          font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px;
          color: #dfe8f5; backdrop-filter: blur(4px);
        }
        button, select {
          background: rgba(255, 255, 255, 0.08); color: #dfe8f5;
          border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 5px;
          padding: 4px 10px; font: inherit; cursor: pointer;
        }
        button:hover, select:hover { background: rgba(255, 255, 255, 0.16); }
        button.on { background: #2b6cb0; border-color: #63b3ed; color: #fff; }
        .sep { width: 1px; height: 18px; background: rgba(255,255,255,0.18); }
        .tip { width: 100%; color: #8fa3bd; font-size: 11px; }
      </style>
      <div class="bar">
        <button data-cmd="wireframe">线框</button>
        <button data-cmd="normals">法线着色</button>
        <button data-cmd="contours">等高线</button>
        <select id="interval" title="等高线间距">
          <option value="20">20 m</option>
          <option value="50" selected>50 m</option>
          <option value="100">100 m</option>
        </select>
        <div class="sep"></div>
        <button data-cmd="export-obj">导出 OBJ</button>
        <button data-cmd="export-height">导出高程图</button>
        <div class="tip">点击坡面选取瓦片后再导出(默认取准星处瓦片)</div>
      </div>
    `;
    root.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = (btn as HTMLButtonElement).dataset.cmd!;
        let on = true;
        if (cmd === 'wireframe' || cmd === 'normals' || cmd === 'contours') {
          on = btn.classList.toggle('on');
        }
        this.dispatchEvent(new CustomEvent('terrain-cmd', {
          bubbles: true, composed: true,
          detail: { cmd, on },
        }));
      });
    });
    root.getElementById('interval')!.addEventListener('change', (e) => {
      this.dispatchEvent(new CustomEvent('terrain-cmd', {
        bubbles: true, composed: true,
        detail: { cmd: 'interval', value: Number((e.target as HTMLSelectElement).value) },
      }));
    });
  }
}
customElements.define('terrain-toolbar', TerrainToolbar);
