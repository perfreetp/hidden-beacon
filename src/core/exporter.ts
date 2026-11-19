import type { TileRec } from './tileManager';

/** 导出单块瓦片表面(不含裙边)为 OBJ 文本,坐标为瓦片局部坐标 */
export function tileToOBJ(rec: TileRec): string {
  const pos = rec.mesh.geometry.getAttribute('position');
  const nor = rec.mesh.geometry.getAttribute('normal');
  const idx = rec.mesh.geometry.index!;
  const lines: string[] = [
    `# terrain tile ${rec.key}`,
    `# origin (m): ${rec.originX} ${rec.originZ}, size: ${rec.size}m, segments: ${rec.segs}`,
    `# vertices are tile-local (subtract origin to get world)`,
  ];
  for (let i = 0; i < rec.surfVerts; i++) {
    lines.push(
      `v ${(pos.getX(i) - rec.originX).toFixed(2)} ${pos.getY(i).toFixed(2)} ${(pos.getZ(i) - rec.originZ).toFixed(2)}`
    );
  }
  for (let i = 0; i < rec.surfVerts; i++) {
    lines.push(`vn ${nor.getX(i).toFixed(4)} ${nor.getY(i).toFixed(4)} ${nor.getZ(i).toFixed(4)}`);
  }
  for (let i = 0; i < rec.surfIndices; i += 3) {
    const a = idx.getX(i) + 1, b = idx.getX(i + 1) + 1, c = idx.getX(i + 2) + 1;
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  }
  return lines.join('\n');
}

/** 导出单块瓦片高程图(灰度 PNG,黑=最低,白=最高) */
export function tileToHeightCanvas(rec: TileRec): HTMLCanvasElement {
  const n = rec.segs + 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < rec.heights.length; i++) {
    if (rec.heights[i] < min) min = rec.heights[i];
    if (rec.heights[i] > max) max = rec.heights[i];
  }
  const range = Math.max(max - min, 1e-6);
  for (let i = 0; i < rec.heights.length; i++) {
    const g = Math.round(((rec.heights[i] - min) / range) * 255);
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeId(key: string): string {
  return key.replace(/:/g, '_').replace(/-/g, 'm');
}
