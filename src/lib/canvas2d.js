import { SPECIES_BY_ID } from './species.js';
import { plantColor, sortedPlants, rockTriangles } from './webgpu.js';
import { waterDistance, sunAt } from './generate.js';

const ASPECT_DIR = {
  '南': [0, -1], '东南': [0.707, -0.707], '东': [1, 0], '东北': [0.707, 0.707],
  '北': [0, 1], '西北': [-0.707, 0.707], '西': [-1, 0], '西南': [-0.707, -0.707], '平': [0, 0]
};

// 与 WebGPU 渲染器同接口的 Canvas2D 回退
export function createCanvas2DRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  return {
    kind: 'canvas2d',
    render(state) {
      const { plants, rocks, params, season, view, pickedId, boxIds } = state;
      const dpr = view.dpr || 1;
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) return;
      const scale = view.scale * dpr;
      const ox = view.ox * dpr;
      const oy = view.oy * dpr;
      const X = (wx) => wx * scale + ox;
      const Y = (wy) => wy * scale + oy;

      ctx.fillStyle = '#21241f';
      ctx.fillRect(0, 0, w, h);

      // 地面(分块着色模拟湿度/光照)
      const cell = Math.max(8, scale * 2);
      const sun = ASPECT_DIR[params.aspect] || [0, 0];
      for (let sy = 0; sy < h; sy += cell) {
        for (let sx = 0; sx < w; sx += cell) {
          const wx = (sx + cell / 2 - ox) / scale;
          const wy = (sy + cell / 2 - oy) / scale;
          if (wx < 0 || wy < 0 || wx > params.length || wy > params.width) continue;
          const d = waterDistance(wx, wy, params);
          if (d <= 0) {
            ctx.fillStyle = '#3d76a8';
          } else {
            const near = Math.max(0, 1 - d / 18);
            const moist = Math.min(1, Math.max(0, 0.25 + 0.65 * near));
            const g = ((wx / params.length) * 2 - 1) * sun[0] + ((wy / params.width) * 2 - 1) * sun[1];
            const lit = 0.92 + 0.16 * (0.65 + 0.3 * g);
            const r = Math.round((0.47 + (0.32 - 0.47) * moist) * 255 * lit);
            const gg = Math.round((0.44 + (0.42 - 0.44) * moist) * 255 * lit);
            const b = Math.round((0.31 + (0.24 - 0.31) * moist) * 255 * lit);
            ctx.fillStyle = `rgb(${r},${gg},${b})`;
          }
          ctx.fillRect(sx, sy, cell + 1, cell + 1);
        }
      }

      // 裸石
      const tris = rockTriangles(rocks);
      ctx.fillStyle = '#8f8f8a';
      for (let i = 0; i < tris.length; i += 9) {
        ctx.beginPath();
        ctx.moveTo(X(tris[i]), Y(tris[i + 1]));
        ctx.lineTo(X(tris[i + 3]), Y(tris[i + 4]));
        ctx.lineTo(X(tris[i + 6]), Y(tris[i + 7]));
        ctx.closePath();
        const sh = tris[i + 2];
        const c = Math.round(107 + sh * 60);
        ctx.fillStyle = `rgb(${c},${c},${c - 4})`;
        ctx.fill();
      }

      // 植株
      for (const p of sortedPlants(plants)) {
        const [r, g, b] = plantColor(p, season);
        const cx = X(p.x);
        const cy = Y(p.y);
        const rad = p.r * scale;
        const grad = ctx.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
        grad.addColorStop(0, `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},0.96)`);
        grad.addColorStop(1, `rgba(${Math.round(r * 200)},${Math.round(g * 200)},${Math.round(b * 200)},0.9)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
        if (p.locked) {
          ctx.strokeStyle = '#ffc733';
          ctx.lineWidth = Math.max(1.5, rad * 0.08);
          ctx.beginPath();
          ctx.arc(cx, cy, rad * 0.67, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (boxIds && boxIds.has(p.id)) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, rad * 0.82, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (p.id === pickedId) {
          ctx.strokeStyle = '#33e0ff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(cx, cy, rad * 0.95, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  };
}
