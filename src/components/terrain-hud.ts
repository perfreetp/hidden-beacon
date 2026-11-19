const PANEL_CSS = `
  :host {
    position: absolute;
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 12px;
    color: #dfe8f5;
    pointer-events: none;
    user-select: none;
  }
  .panel {
    background: rgba(10, 14, 20, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 8px 12px;
    line-height: 1.7;
    backdrop-filter: blur(4px);
  }
`;

export interface HudStats {
  loaded: number;
  lod0: number;
  lod1: number;
  frustumCulled: number;
  occluded: number;
  submitted: number;
  tris: number;
  camHeight: number;
  lodLabel: string;
}

export class TerrainHud extends HTMLElement {
  private panel: HTMLDivElement;
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        ${PANEL_CSS}
        :host { top: 12px; left: 12px; }
        .num { color: #7fd4ff; }
        .warn { color: #ffb35a; }
      </style>
      <div class="panel" id="p"></div>
    `;
    this.panel = root.getElementById('p') as HTMLDivElement;
  }
  update(s: HudStats): void {
    this.panel.innerHTML =
      `已加载瓦片 <span class="num">${s.loaded}</span> (LOD0 ${s.lod0} / LOD1 ${s.lod1})<br>` +
      `被裁掉 <span class="warn">${s.frustumCulled + s.occluded}</span> ` +
      `(视锥 ${s.frustumCulled} / 山脊遮挡 ${s.occluded}) · 提交 ${s.submitted}<br>` +
      `三角形 <span class="num">${s.tris.toLocaleString()}</span><br>` +
      `相机离地 <span class="num">${s.camHeight.toFixed(0)} m</span> · ${s.lodLabel}`;
  }
}
customElements.define('terrain-hud', TerrainHud);
