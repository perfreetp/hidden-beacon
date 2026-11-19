// 导出：独立 SVG 文件 与 巡检记录报告（HTML 可打印）
import { devicePrimitives, pipePrimitives } from './engine/shapes.js';
import { TYPES } from './engine/catalog.js';

const SCALE = 60;       // px / 米
const PAD = 56;
const STATUS_STYLE = {
  added: { stroke: '#059669', width: 0.28, dash: '' },
  removed: { stroke: '#dc2626', width: 0.24, dash: '0.35 0.2' },
  moved: { stroke: '#d97706', width: 0.28, dash: '' },
  locked: { stroke: '#7c3aed', width: 0.2, dash: '0.25 0.15' }
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function prim(tag, attrs, diffStatus) {
  const a = { ...attrs };
  if (diffStatus && STATUS_STYLE[diffStatus]) {
    const st = STATUS_STYLE[diffStatus];
    if (a.stroke && a.stroke !== 'none') a.stroke = st.stroke;
    a['stroke-width'] = Math.max(a['stroke-width'] || 0.1, st.width);
    if (st.dash) a['stroke-dasharray'] = st.dash;
    if (diffStatus === 'removed') a.opacity = 0.55;
  }
  const attrStr = Object.entries(a)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(' ');
  return `<${tag} ${attrStr}/>`;
}

export function buildSvg(facade, opts = {}) {
  const {
    showGrid = true, showDevices = true, showPipes = true, showLabels = true,
    diff = null, title = '立面排布图'
  } = opts;
  const { bounds, grid, devices, pipes, params } = facade;
  const W = bounds.width * SCALE + PAD * 2;
  const H = bounds.height * SCALE + PAD * 2 + 28;
  const diffMap = new Map((diff?.items || []).map((it) => [it.id, it.status]));

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Microsoft YaHei, sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  out.push(`<text x="${PAD}" y="30" font-size="18" font-weight="700" fill="#0f172a">${esc(title)}</text>`);
  out.push(`<text x="${PAD}" y="48" font-size="11" fill="#64748b">种子 ${esc(params.seed)} · 跨度 ${params.span}m · 层高 ${params.floorHeight}m · 开间 ${params.bays} · 间距 ${params.gap}m · 管径 DN${Math.round(params.pipeDiameter * 1000)}</text>`);

  // 世界坐标组：y 轴向上
  out.push(`<g transform="translate(${PAD},${PAD + bounds.height * SCALE}) scale(${SCALE},${-SCALE})">`);

  if (showGrid) {
    out.push('<g>');
    for (const x of grid.axes) {
      out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${bounds.height}" stroke="#cbd5e1" stroke-width="0.04" stroke-dasharray="0.25 0.18"/>`);
    }
    for (const y of grid.floors) {
      out.push(`<line x1="0" y1="${y}" x2="${bounds.width}" y2="${y}" stroke="#cbd5e1" stroke-width="0.04" stroke-dasharray="0.25 0.18"/>`);
    }
    out.push(`<line x1="0" y1="0" x2="${bounds.width}" y2="0" stroke="#64748b" stroke-width="0.08"/>`);
    out.push('</g>');
    if (showLabels) {
      grid.axes.forEach((x, i) => {
        out.push(`<g transform="translate(${x},-0.35) scale(1,-1)"><text font-size="0.42" fill="#94a3b8" text-anchor="middle">轴${i + 1}</text></g>`);
      });
      grid.floors.forEach((y) => {
        out.push(`<g transform="translate(-0.25,${y}) scale(1,-1)"><text font-size="0.42" fill="#94a3b8" text-anchor="end" dominant-baseline="middle">${y}m</text></g>`);
      });
    }
  }

  // 管线（含差异中被删除的旧管线幽灵）
  if (showPipes) {
    for (const p of pipes) {
      if (p.visible === false) continue;
      const st = diffMap.get(p.id);
      for (const pr2 of pipePrimitives(p)) out.push(prim(pr2.tag, pr2.attrs, st));
    }
    for (const it of diff?.items || []) {
      if (it.status === 'removed' && it.kind === 'pipe') {
        for (const pr2 of pipePrimitives(it.before)) out.push(prim(pr2.tag, pr2.attrs, 'removed'));
      }
    }
  }

  // 设备
  if (showDevices) {
    for (const d of devices) {
      if (d.visible === false) continue;
      const st = diffMap.get(d.id);
      const { primitives } = devicePrimitives(d);
      for (const pr2 of primitives) out.push(prim(pr2.tag, pr2.attrs, st));
      if (showLabels) {
        const lx = d.x + d.w / 2;
        const ly = Math.min(d.y + d.h + 0.55, bounds.height - 0.4);
        out.push(`<g transform="translate(${lx},${ly}) scale(1,-1)"><text font-size="0.46" font-weight="600" fill="#0f172a" text-anchor="middle">${esc(d.code)}</text>`
          + `<text y="0.55" font-size="0.38" fill="#64748b" text-anchor="middle">${esc(d.model)} · 挂点${d.anchorHeight ?? (d.y + d.h)}m</text></g>`);
      }
      if (d.locked && !st) {
        const { hit } = devicePrimitives(d);
        out.push(`<rect x="${hit.x}" y="${hit.y}" width="${hit.w}" height="${hit.h}" fill="none" stroke="${STATUS_STYLE.locked.stroke}" stroke-width="${STATUS_STYLE.locked.width}" stroke-dasharray="${STATUS_STYLE.locked.dash}"/>`);
      }
    }
    for (const it of diff?.items || []) {
      if (it.status === 'removed' && it.kind === 'device') {
        const { primitives } = devicePrimitives(it.before);
        for (const pr2 of primitives) out.push(prim(pr2.tag, pr2.attrs, 'removed'));
      }
    }
  }

  out.push('</g>');

  // 图例（屏幕坐标）
  const legendY = H - 26;
  const legend = [
    ['#0ea5e9', '脱硫塔'], ['#f59e0b', '布袋除尘器'], ['#64748b', '烟囱/管线'],
    ['#ef4444', '采样探头'], ['#14b8a6', '管廊'], ['#8b5cf6', '爬梯']
  ];
  let lx = PAD;
  for (const [c, t] of legend) {
    out.push(`<rect x="${lx}" y="${legendY - 10}" width="14" height="10" fill="#fff" stroke="${c}" stroke-width="2"/>`);
    out.push(`<text x="${lx + 18}" y="${legendY - 1}" font-size="11" fill="#475569">${t}</text>`);
    lx += 18 + t.length * 13 + 14;
  }
  if (diff) {
    const ds = [['#059669', '新增'], ['#dc2626', '删除'], ['#d97706', '移动']];
    for (const [c, t] of ds) {
      out.push(`<line x1="${lx}" y1="${legendY - 5}" x2="${lx + 16}" y2="${legendY - 5}" stroke="${c}" stroke-width="3"/>`);
      out.push(`<text x="${lx + 20}" y="${legendY - 1}" font-size="11" fill="#475569">${t}</text>`);
      lx += 48;
    }
  }
  out.push('</svg>');
  return out.join('\n');
}

export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportSvg(facade, filename, opts = {}) {
  download(filename, buildSvg(facade, opts), 'image/svg+xml;charset=utf-8');
}

export function exportReport(project, version, diff = null) {
  const facade = version.facade;
  const { params, devices, pipes, meta } = facade;
  const svg = buildSvg(facade, { diff, title: `${project.name} — V${version.n}` });
  const review = project.review;

  const devRows = devices.map((d) => `
    <tr>
      <td>${esc(d.code)}</td><td>${esc(TYPES[d.type].name)}</td><td>${esc(d.model)}</td>
      <td>${d.anchorHeight ?? (d.y + d.h)}</td>
      <td>${d.x.toFixed(2)}, ${d.y.toFixed(2)}</td>
      <td>${d.locked ? '<span class="v">已锁定</span>' : '规则排布'}</td>
      <td>${d.visible === false ? '隐藏' : '显示'}</td>
    </tr>`).join('');

  const pipeRows = pipes.map((p) => `
    <tr>
      <td>${esc(p.code)}</td><td>DN${Math.round(p.diameter * 1000)}</td>
      <td>${p.x1.toFixed(2)}, ${p.y1.toFixed(2)} → ${p.x2.toFixed(2)}, ${p.y2.toFixed(2)}</td>
      <td>${p.locked ? '<span class="v">已锁定</span>' : '规则排布'}</td>
    </tr>`).join('');

  const diffSection = diff ? `
    <h2>版本变更摘要</h2>
    <table><tr><th>新增</th><th>删除</th><th>移动</th><th>未变</th></tr>
    <tr><td class="g">${diff.counts.added}</td><td class="r">${diff.counts.removed}</td>
    <td class="a">${diff.counts.moved}</td><td>${diff.counts.same}</td></tr></table>` : '';

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${esc(project.name)} 巡检记录报告</title>
<style>
  body{font-family:'Segoe UI','Microsoft YaHei',sans-serif;margin:32px;color:#0f172a}
  h1{font-size:20px}h2{font-size:15px;margin-top:26px;border-left:4px solid #1d4ed8;padding-left:8px}
  table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
  th{background:#f1f5f9}.meta td:first-child{width:130px;color:#64748b}
  .g{color:#059669;font-weight:700}.r{color:#dc2626;font-weight:700}.a{color:#d97706;font-weight:700}
  .v{color:#7c3aed}svg{border:1px solid #e2e8f0;border-radius:8px;max-width:100%;height:auto;margin-top:10px}
  .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-top:8px}
  @media print{body{margin:10mm}}
</style></head><body>
<h1>烟气监测设备巡检记录报告</h1>
<table class="meta">
  <tr><td>项目编号</td><td>${esc(project.id)}</td><td>项目名称</td><td>${esc(project.name)}</td></tr>
  <tr><td>厂区</td><td>${esc(project.area)}</td><td>版本</td><td>V${version.n}（${esc(version.note || '')}）</td></tr>
  <tr><td>生成时间</td><td>${new Date(version.createdAt).toLocaleString('zh-CN')}</td>
  <td>导出时间</td><td>${new Date().toLocaleString('zh-CN')}</td></tr>
  <tr><td>种子</td><td>${esc(params.seed)}</td>
  <td>构件统计</td><td>设备 ${meta.deviceCount} 件 / 管线 ${meta.pipeCount} 段 / 锁定 ${meta.lockedCount} 处</td></tr>
</table>
<h2>生成参数</h2>
<table><tr><th>跨度(m)</th><th>层高(m)</th><th>开间数</th><th>设备间距(m)</th><th>管径(m)</th></tr>
<tr><td>${params.span}</td><td>${params.floorHeight}</td><td>${params.bays}</td><td>${params.gap}</td><td>${params.pipeDiameter}</td></tr></table>
<h2>立面图</h2>${svg}
${diffSection}
<h2>设备清册（${devices.length}）</h2>
<table><tr><th>编号</th><th>类型</th><th>型号</th><th>挂点高度(m)</th><th>坐标(x,y)</th><th>状态</th><th>图层</th></tr>${devRows}</table>
<h2>管线清册（${pipes.length}）</h2>
<table><tr><th>编号</th><th>管径</th><th>走向坐标</th><th>状态</th></tr>${pipeRows}</table>
<h2>审核意见</h2>
<div class="box">${review ? `<b>${review.decision === 'approved' ? '审核通过' : '退回修改'}</b>（${esc(review.reviewer)} · ${new Date(review.decidedAt).toLocaleString('zh-CN')}）<br>${esc(review.comment || '（无）')}` : '尚未审核'}</div>
</body></html>`;

  download(`${project.id}-V${version.n}-巡检记录.html`, html, 'text/html;charset=utf-8');
}
