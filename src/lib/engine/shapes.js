// 设备立面图例：返回 SVG 基元数组，画布与导出共用同一套符号
import { TYPES } from './catalog.js';

// 每种设备返回 { primitives: [{tag, attrs, text?}], anchor }
export function devicePrimitives(d) {
  const { x, y, w, h } = d;
  const color = TYPES[d.type].color;
  const base = { fill: '#ffffff', stroke: color, 'stroke-width': 0.12 };
  switch (d.type) {
    case 'desulf': {
      const prims = [
        { tag: 'rect', attrs: { ...base, x, y: y + h * 0.12, width: w, height: h * 0.88, rx: 0.5 } },
        { tag: 'ellipse', attrs: { ...base, cx: x + w / 2, cy: y + h * 0.12, rx: w / 2, ry: h * 0.08 } },
        { tag: 'ellipse', attrs: { ...base, cx: x + w / 2, cy: y + h * 0.45, rx: w * 0.32, ry: h * 0.04, 'stroke-dasharray': '0.2 0.15' } },
        { tag: 'ellipse', attrs: { ...base, cx: x + w / 2, cy: y + h * 0.68, rx: w * 0.32, ry: h * 0.04, 'stroke-dasharray': '0.2 0.15' } },
        { tag: 'line', attrs: { x1: x + w * 0.15, y1: y + h, x2: x + w * 0.15, y2: y + h - 0.7, stroke: color, 'stroke-width': 0.1 } },
        { tag: 'line', attrs: { x1: x + w * 0.85, y1: y + h, x2: x + w * 0.85, y2: y + h - 0.7, stroke: color, 'stroke-width': 0.1 } }
      ];
      return { primitives: prims, hit: { x, y, w, h } };
    }
    case 'baghouse': {
      const n = 4;
      const cw = w / n;
      const prims = [
        { tag: 'rect', attrs: { ...base, x, y: y + h * 0.15, width: w, height: h * 0.75 } },
        { tag: 'polygon', attrs: { ...base, points: `${x},${y + h * 0.15} ${x + w / 2},${y} ${x + w},${y + h * 0.15}` } },
        { tag: 'rect', attrs: { ...base, x, y: y + h * 0.9, width: w, height: h * 0.1 } }
      ];
      for (let i = 1; i < n; i++) {
        prims.push({ tag: 'line', attrs: { x1: x + cw * i, y1: y + h * 0.15, x2: x + cw * i, y2: y + h * 0.9, stroke: color, 'stroke-width': 0.08, 'stroke-dasharray': '0.15 0.1' } });
      }
      for (let i = 0; i < n; i++) {
        prims.push({ tag: 'line', attrs: { x1: x + cw * (i + 0.5), y1: y + h * 0.3, x2: x + cw * (i + 0.5), y2: y + h * 0.85, stroke: color, 'stroke-width': 0.12 } });
      }
      return { primitives: prims, hit: { x, y, w, h } };
    }
    case 'stack': {
      const bw = w * 0.6;
      const bx = x + (w - bw) / 2;
      const prims = [
        { tag: 'path', attrs: { ...base, d: `M ${x},${y + h} L ${x + w},${y + h} L ${x + w * 0.72},${y} L ${x + w * 0.28},${y} Z` } },
        { tag: 'ellipse', attrs: { ...base, cx: x + w / 2, cy: y, rx: w * 0.22, ry: h * 0.03 } },
        { tag: 'rect', attrs: { ...base, x: bx, y: y + h - 3.2, width: bw, height: 0.35 } },
        { tag: 'line', attrs: { x1: bx, y1: y + h - 3.2, x2: bx, y2: y + h - 2.3, stroke: color, 'stroke-width': 0.08 } },
        { tag: 'line', attrs: { x1: bx + bw, y1: y + h - 3.2, x2: bx + bw, y2: y + h - 2.3, stroke: color, 'stroke-width': 0.08 } },
        { tag: 'rect', attrs: { ...base, x: bx, y: y + h - 2.3, width: bw, height: 0.25 } }
      ];
      return { primitives: prims, hit: { x, y, w, h } };
    }
    case 'probe': {
      return {
        primitives: [
          { tag: 'rect', attrs: { ...base, x, y, width: w, height: h, rx: 0.1 } },
          { tag: 'line', attrs: { x1: x + w / 2, y1: y + h, x2: x + w / 2, y2: y + h + 0.5, stroke: color, 'stroke-width': 0.08, 'stroke-dasharray': '0.12 0.08' } },
          { tag: 'circle', attrs: { cx: x + w / 2, cy: y + h * 0.4, r: w * 0.18, fill: color, stroke: 'none' } }
        ],
        hit: { x, y: y - 0.1, w, h: h + 0.6 }
      };
    }
    case 'rack': {
      const prims = [];
      const post = 0.18;
      prims.push({ tag: 'rect', attrs: { x, y, width: post, height: h, fill: color, stroke: 'none' } });
      prims.push({ tag: 'rect', attrs: { x: x + w - post, y, width: post, height: h, fill: color, stroke: 'none' } });
      for (const fy of [0.35, 0.7]) {
        prims.push({ tag: 'rect', attrs: { x, y: y + h * fy, width: w, height: 0.22, fill: color, stroke: 'none' } });
      }
      prims.push({ tag: 'line', attrs: { x1: x, y1: y + h * 0.35, x2: x + w, y2: y + h * 0.7, stroke: color, 'stroke-width': 0.08 } });
      prims.push({ tag: 'line', attrs: { x1: x + w, y1: y + h * 0.35, x2: x, y2: y + h * 0.7, stroke: color, 'stroke-width': 0.08 } });
      return { primitives: prims, hit: { x, y, w, h } };
    }
    case 'ladder': {
      const prims = [
        { tag: 'line', attrs: { x1: x + 0.15, y1: y, x2: x + 0.15, y2: y + h, stroke: color, 'stroke-width': 0.1 } },
        { tag: 'line', attrs: { x1: x + w - 0.15, y1: y, x2: x + w - 0.15, y2: y + h, stroke: color, 'stroke-width': 0.1 } }
      ];
      for (let yy = 0.5; yy < h; yy += 0.7) {
        prims.push({ tag: 'line', attrs: { x1: x + 0.15, y1: y + yy, x2: x + w - 0.15, y2: y + yy, stroke: color, 'stroke-width': 0.07 } });
      }
      prims.push({ tag: 'path', attrs: { ...base, fill: 'none', d: `M ${x - 0.1},${y + h} Q ${x + w / 2},${y - 0.5} ${x + w + 0.1},${y + h}`, 'stroke-dasharray': '0.2 0.12' } });
      return { primitives: prims, hit: { x: x - 0.15, y, w: w + 0.3, h } };
    }
    default:
      return { primitives: [{ tag: 'rect', attrs: { ...base, x, y, width: w, height: h } }], hit: { x, y, w, h } };
  }
}

export function pipePrimitives(p) {
  const sw = Math.max(0.14, p.diameter);
  return [{
    tag: 'line',
    attrs: {
      x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2,
      stroke: '#475569', 'stroke-width': sw, 'stroke-linecap': 'round'
    }
  }];
}
