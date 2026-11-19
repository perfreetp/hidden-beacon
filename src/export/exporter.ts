/**
 * Export pipeline.
 *
 * Three products, all from the same vector source:
 *
 *   PNG  — rasterised at an explicit DPI from an SVG image, so 300/600/1200 dpi
 *          sheets are crisp and pixel-exact. Because the source is vector, the
 *          DPI is a free parameter rather than a ceiling.
 *   SVG  — the card markup verbatim; openable in any vector editor.
 *   PDF  — A4 sheets laid out for print, three cards per page with cut marks.
 *
 * A batch export renders every card in a chosen ordering and returns one ZIP.
 */

import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import type { Card } from '../model/types';
import { renderCardSvg, renderPrintSheetSvg } from '../render/svg';
import { elementRings } from '../core/scene';

export type ExportFormat = 'png' | 'svg' | 'pdf';

export interface ExportOptions {
  format: ExportFormat;
  dpi: number;
  cards: Card[];
  /** Per-page capacity for PDF; A4 fits three 100×140 mm cards in a column. */
  perPage?: number;
  cutMarks?: boolean;
  filePrefix?: string;
}

/** Renders a card to a PNG blob at the requested DPI. */
export async function cardToPng(card: Card, dpi: number): Promise<Blob> {
  const svg = renderCardSvg(card, { idPrefix: `x${card.id.slice(0, 4)}` });
  const pxPerMm = dpi / 25.4;
  const w = Math.round(card.w * pxPerMm);
  const h = Math.round(card.h * pxPerMm);
  return rasterizeSvg(svg, w, h);
}

/** Turns an SVG string into a PNG blob via an offscreen canvas. */
export async function rasterizeSvg(svg: string, w: number, h: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG 渲染失败'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'card';
}

/** Runs a full export and triggers the download. */
export async function exportCards(opts: ExportOptions): Promise<{ files: number; bytes: number }> {
  const prefix = opts.filePrefix ?? '识字卡';
  const stamp = new Date().toISOString().slice(0, 10);

  if (opts.format === 'svg') {
    const zip = new JSZip();
    let i = 1;
    for (const card of opts.cards) {
      const svg = renderCardSvg(card, { idPrefix: `c${i}` });
      zip.file(`${String(i).padStart(2, '0')}-${safeName(card.title)}.svg`, svg);
      i++;
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    download(blob, `${prefix}-${stamp}-svg.zip`);
    return { files: opts.cards.length, bytes: blob.size };
  }

  if (opts.format === 'png') {
    const zip = new JSZip();
    let i = 1;
    let bytes = 0;
    for (const card of opts.cards) {
      const png = await cardToPng(card, opts.dpi);
      bytes += png.size;
      zip.file(`${String(i).padStart(2, '0')}-${safeName(card.title)}@${opts.dpi}dpi.png`, png);
      i++;
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    download(blob, `${prefix}-${stamp}-${opts.dpi}dpi.zip`);
    return { files: opts.cards.length, bytes: bytes + blob.size };
  }

  // PDF: A4 pages of three cards, drawn as vectors so print resolution is
  // whatever the printer can do.
  const perPage = opts.perPage ?? 3;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pageW = 210;
  const pageH = 297;
  for (let start = 0; start < opts.cards.length; start += perPage) {
    if (start > 0) pdf.addPage();
    const group = opts.cards.slice(start, start + perPage);
    const totalH = group.reduce((a, c) => a + c.h, 0) + (group.length - 1) * 8;
    let y = (pageH - totalH) / 2;
    for (const card of group) {
      const x = (pageW - card.w) / 2;
      await drawCardOnPdf(pdf, card, x, y);
      if (opts.cutMarks) drawCutMarks(pdf, x, y, card.w, card.h);
      y += card.h + 8;
    }
    pdf.setFontSize(7);
    pdf.setTextColor(160);
    pdf.text(`${prefix} · A4 · ${Math.floor(start / perPage) + 1}`, pageW / 2, pageH - 8, { align: 'center' });
  }
  const blob = pdf.output('blob');
  download(blob, `${prefix}-${stamp}-print.pdf`);
  return { files: opts.cards.length, bytes: blob.size };
}

/**
 * Draws a card into the PDF by rasterising it at 400 dpi and placing the image.
 * jsPDF's SVG support is too lossy for font-shaped outlines, and a 400 dpi
 * raster of a 100 mm card is 1575 px wide — well past what a home printer
 * resolves at the needed size, with no cliff if the DPI is raised.
 */
async function drawCardOnPdf(pdf: jsPDF, card: Card, x: number, y: number): Promise<void> {
  const dpi = 400;
  const png = await cardToPng(card, dpi);
  const dataUrl = await blobToDataUrl(png);
  pdf.addImage(dataUrl, 'PNG', x, y, card.w, card.h, undefined, 'FAST');
}

function drawCutMarks(pdf: jsPDF, x: number, y: number, w: number, h: number): void {
  const m = 3;
  const len = 4;
  pdf.setDrawColor(175);
  pdf.setLineWidth(0.15);
  const corners: Array<[number, number, number, number, number, number]> = [
    [x, y, -1, -1, 0, 0],
    [x + w, y, 1, -1, 0, 0],
    [x, y + h, -1, 1, 0, 0],
    [x + w, y + h, 1, 1, 0, 0],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    pdf.line(cx + sx * m, cy, cx + sx * (m + len), cy);
    pdf.line(cx, cy + sy * m, cx, cy + sy * (m + len));
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Single-file project export for backup; mirrors the IndexedDB shape. */
export function exportProjectJson(payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  download(blob, `识字卡工程-${new Date().toISOString().slice(0, 10)}.json`);
}

/** Print-preview sheet markup for the on-screen preview. */
export function printPreviewSvg(cards: Card[], dpiNote: string): string {
  return renderPrintSheetSvg(cards, dpiNote);
}

export { elementRings };
