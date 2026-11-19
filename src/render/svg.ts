/**
 * SVG card renderer.
 *
 * The output is one <svg> per card. Everything inside is vector: contours come
 * from the distance fields, so zoom is a pure transform of geometry and never a
 * re-rasterisation. Effects are stacked as separate layers so each is
 * independently adjustable:
 *
 *   shadow   — filled path, offset, Gaussian-blurred, tinted
 *   glow     — filled path, Gaussian-blurred, tinted (radius from the SDF edge)
 *   stroke   — the same path stroked; paint-order:stroke draws it under the fill
 *              and the stroke is twice the requested outward width so that only
 *              the outer half is visible
 *   fill     — the path itself
 *
 * Card units are millimetres; the SVG viewBox is the card in mm, so 1 user unit
 * is 1 mm and the same markup prints at any DPI.
 */

import { elementPath, elementBounds, backgroundPath, paperDots } from '../core/scene';
import { uid, type Card, type Element } from '../model/types';

export interface RenderOptions {
  /** Include the paper background (off for a plain ink-only export). */
  background?: boolean;
  /** Include the frame + dots (off for cut-outs). */
  decoration?: boolean;
  /** Selection and grid overlays are never rendered here — that is the editor's job. */
  interactive?: boolean;
  /** Prefix for generated ids, so several cards can be inlined in one SVG. */
  idPrefix?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Builds the full card markup. Deterministic: identical input gives identical
 * output, so the diff view can compare two versions structurally.
 */
export function renderCardSvg(card: Card, opts: RenderOptions = {}): string {
  const pre = opts.idPrefix ?? 'r';
  const { defs, body, w, h } = cardBody(card, pre, opts);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(w)} ${fmt(h)}" ` +
    `width="${fmt(w)}mm" height="${fmt(h)}mm" role="img" aria-label="${esc(card.title)}" ` +
    `style="background:${esc(card.bg.paper)}">` +
    `<defs>${defs.join('')}</defs>` +
    `<g>${body.join('')}</g>` +
    `</svg>`
  );
}

/**
 * The inner parts of a card: defs and body markup, for callers that compose the
 * card into a larger SVG (the editing stage, the diff view, exports).
 */
export function cardBody(
  card: Card,
  pre: string,
  opts: RenderOptions = {},
): { defs: string[]; body: string[]; w: number; h: number } {
  const { w, h } = card;
  const st = card.style;
  const bgOn = opts.background !== false;
  const deco = opts.decoration !== false;

  const glowBlur = pre + '_glow';
  const shadowBlur = pre + '_shadow';
  const clip = pre + '_clip';

  const defs: string[] = [];
  if (st.glowRadius > 0.01 && st.glowStrength > 0.01) {
    defs.push(`<filter id="${glowBlur}" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur stdDeviation="${fmt(st.glowRadius)}"/></filter>`);
  }
  if (st.shadowOpacity > 0.01 && (st.shadowBlur > 0.01 || st.shadowX || st.shadowY)) {
    defs.push(`<filter id="${shadowBlur}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur stdDeviation="${fmt(Math.max(0, st.shadowBlur))}"/></filter>`);
  }
  defs.push(
    `<clipPath id="${clip}"><rect x="0" y="0" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(Math.min(w, h) * 0.06)}"/></clipPath>`,
  );

  const body: string[] = [];

  // Paper. The rounded rect matches the clip so the card reads as a cut card,
  // not a screenshot of a rectangle.
  const cardR = Math.min(w, h) * 0.06;
  body.push(
    `<rect x="0" y="0" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(cardR)}" fill="${esc(card.bg.paper)}"/>`,
  );

  if (bgOn) {
    const d = backgroundPath(card.bg, w, h);
    if (d) {
      body.push(`<g clip-path="url(#${clip})"><path d="${d}" fill="${esc(card.bg.ink)}" fill-rule="evenodd"/></g>`);
    }
    if (deco && card.bg.dots) {
      const dots = paperDots(w, h, card.bg.seed, Math.round((w * h) / 260));
      body.push(`<g clip-path="url(#${clip})" fill="${esc(card.bg.ink)}" opacity="0.5">` +
        dots.map((p) => `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(p.r)}"/>`).join('') + '</g>');
    }
  }

  // Elements: shapes behind, glyphs in front, stable by array order.
  const behind = card.elements.filter((e) => e.behind);
  const front = card.elements.filter((e) => !e.behind);
  body.push(renderLayer(behind, card, pre));
  body.push(renderLayer(front, card, pre));

  if (deco && card.bg.frame) {
    const inset = Math.min(w, h) * 0.045;
    const r = Math.min(w, h) * 0.055;
    body.push(
      `<rect x="${fmt(inset)}" y="${fmt(inset)}" width="${fmt(w - inset * 2)}" height="${fmt(h - inset * 2)}" rx="${fmt(r)}" ` +
      `fill="none" stroke="${esc(card.bg.frameColor)}" stroke-width="${fmt(Math.max(0.35, Math.min(w, h) * 0.006))}" opacity="0.85"/>`,
    );
  }

  return { defs, body, w, h };
}

function renderLayer(els: Element[], card: Card, pre: string): string {
  const st = card.style;
  const glowId = pre + '_glow';
  const shadowId = pre + '_shadow';
  const out: string[] = [];
  for (const el of els) {
    const d = elementPath(el);
    if (!d) continue;
    const isInk = el.type === 'glyph' || !el.behind;
    const color = el.color;
    const parts: string[] = [];

    // Shadow, for every element that has one configured.
    if (st.shadowOpacity > 0.01) {
      const filter = st.shadowBlur > 0.01 ? ` filter="url(#${shadowId})"` : '';
      parts.push(
        `<path d="${d}" fill="${esc(st.shadowColor)}" opacity="${fmt(st.shadowOpacity)}"` +
        `${filter} transform="translate(${fmt(st.shadowX)} ${fmt(st.shadowY)})"/>`,
      );
    }

    // Glow only applies to ink elements; decorative shapes would just bloom.
    if (isInk && st.glowRadius > 0.01 && st.glowStrength > 0.01) {
      parts.push(
        `<path d="${d}" fill="${esc(st.glowColor)}" opacity="${fmt(st.glowStrength)}" filter="url(#${glowId})"/>`,
      );
    }

    // The stroke: paint-order would put half of it inside the fill, so instead
    // run it underneath the fill at twice the outward width.
    if (isInk && st.strokeWidth > 0.001) {
      parts.push(
        `<path d="${d}" fill="none" stroke="${esc(st.strokeColor)}" stroke-width="${fmt(st.strokeWidth * 2)}" ` +
        `stroke-linejoin="round" stroke-linecap="round"/>`,
      );
    }

    parts.push(`<path d="${d}" fill="${esc(color)}" fill-rule="evenodd"/>`);
    out.push(`<g data-el="${el.id}">${parts.join('')}</g>`);
  }
  return out.join('');
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 1000) / 1000;
  return String(r);
}

/** Unique id generator used by the export bundler. */
export function renderPrefix(): string {
  return uid('c');
}

export { elementBounds };

/**
 * A4 print sheet preview: cards laid out on a page with cut marks, drawn from
 * the same vector card body used everywhere else.
 */
export function renderPrintSheetSvg(cards: Card[], note: string): string {
  const pageW = 210;
  const pageH = 297;
  const gap = 8;
  const margin = 14;
  const parts: string[] = [];
  const defsAll: string[] = [];

  let y = margin;
  cards.forEach((card, i) => {
    const x = (pageW - card.w) / 2;
    if (y + card.h > pageH - margin) return;
    const { defs, body } = cardBody(card, `p${i}`, {});
    defsAll.push(...defs);
    parts.push(
      `<g transform="translate(${fmt(x)} ${fmt(y)})">${body.join('')}</g>`,
      cutMarks(x, y, card.w, card.h),
    );
    y += card.h + gap;
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageW} ${pageH}" role="img" aria-label="打印预览">` +
    `<defs>${defsAll.join('')}</defs>` +
    `<rect width="${pageW}" height="${pageH}" fill="#fffefb"/>` +
    parts.join('') +
    `<text x="${pageW / 2}" y="${pageH - 6}" text-anchor="middle" font-size="3.2" fill="#a09888">${escapeXml(note)}</text>` +
    `</svg>`
  );
}

function cutMarks(x: number, y: number, w: number, h: number): string {
  const m = 2.5;
  const len = 4;
  const s = `stroke="#c9c2b4" stroke-width="0.18"`;
  return (
    `<g ${s} fill="none">` +
    `<line x1="${fmt(x - m - len)}" y1="${fmt(y)}" x2="${fmt(x - m)}" y2="${fmt(y)}"/>` +
    `<line x1="${fmt(x + w + m)}" y1="${fmt(y)}" x2="${fmt(x + w + m + len)}" y2="${fmt(y)}"/>` +
    `<line x1="${fmt(x - m - len)}" y1="${fmt(y + h)}" x2="${fmt(x - m)}" y2="${fmt(y + h)}"/>` +
    `<line x1="${fmt(x + w + m)}" y1="${fmt(y + h)}" x2="${fmt(x + w + m + len)}" y2="${fmt(y + h)}"/>` +
    `<line x1="${fmt(x)}" y1="${fmt(y - m - len)}" x2="${fmt(x)}" y2="${fmt(y - m)}"/>` +
    `<line x1="${fmt(x)}" y1="${fmt(y + h + m)}" x2="${fmt(x)}" y2="${fmt(y + h + m + len)}"/>` +
    `<line x1="${fmt(x + w)}" y1="${fmt(y - m - len)}" x2="${fmt(x + w)}" y2="${fmt(y - m)}"/>` +
    `<line x1="${fmt(x + w)}" y1="${fmt(y + h + m)}" x2="${fmt(x + w)}" y2="${fmt(y + h + m + len)}"/>` +
    `</g>`
  );
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
