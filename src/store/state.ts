/**
 * Application state.
 *
 * A tiny observable store: the UI dispatches intents, the store mutates the
 * active card, and every subscriber re-renders. Mutations are coalesced so a
 * burst of slider events produces one save.
 */

import { cloneCard, uid, type Card, type Element, type Version, type Project } from '../model/types';
import { newCard, defaultBackground, defaultStyle, generateBlobs } from '../model/defaults';
import * as db from './db';
import { elementPath, elementField, elementRings } from '../core/scene';

export interface DiffSelection {
  a: string | null;
  b: string | null;
}

export interface AppState {
  cards: Card[];
  versions: Record<string, Version[]>;
  activeCardId: string;
  selectedIds: string[];
  diff: DiffSelection;
  zoom: number;
  panX: number;
  panY: number;
  status: string;
  busy: boolean;
  view: 'edit' | 'diff' | 'print';
  dirty: boolean;
}

type Listener = (s: AppState) => void;

const state: AppState = {
  cards: [],
  versions: {},
  activeCardId: '',
  selectedIds: [],
  diff: { a: null, b: null },
  zoom: 1,
  panX: 0,
  panY: 0,
  status: '',
  busy: false,
  view: 'edit',
  dirty: false,
};

const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): AppState {
  return state;
}

export function activeCard(): Card {
  return state.cards.find((c) => c.id === state.activeCardId) ?? state.cards[0];
}

let pendingNotify = false;
export function notify(patch: Partial<AppState> = {}): void {
  Object.assign(state, patch);
  if (pendingNotify) return;
  pendingNotify = true;
  queueMicrotask(() => {
    pendingNotify = false;
    for (const fn of listeners) fn(state);
  });
}

/** Runs a mutation on the active card and marks it dirty. */
export function mutateCard(fn: (card: Card) => void, opts: { save?: boolean } = {}): void {
  const card = activeCard();
  if (!card) return;
  fn(card);
  card.updatedAt = Date.now();
  notify({ dirty: true });
  if (opts.save !== false) scheduleSave();
}

let saveTimer: number | null = null;
function scheduleSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    saveTimer = null;
    await persistActive();
    scheduleAutoVersion();
  }, 380);
}

/**
 * Auto-versioning.
 *
 * "每改一次保存成一个版本" is served literally, but a slider drag fires dozens of
 * mutations. So a version is written once the edits have settled for a moment,
 * and only when the card actually differs from the last snapshot. A burst of
 * drag events therefore produces exactly one version, while two separate edits
 * produce two.
 */
const AUTO_VERSION_IDLE = 2600;
let autoTimer: number | null = null;

function scheduleAutoVersion(): void {
  if (autoTimer !== null) clearTimeout(autoTimer);
  autoTimer = window.setTimeout(() => {
    autoTimer = null;
    void snapshotIfChanged();
  }, AUTO_VERSION_IDLE);
}

function cardSignature(card: Card): string {
  // updatedAt is excluded so a no-op touch does not create a version.
  const { updatedAt, ...rest } = card;
  void updatedAt;
  return JSON.stringify(rest);
}

/** Writes a version if the active card differs from the newest snapshot. */
export async function snapshotIfChanged(): Promise<Version | null> {
  const card = activeCard();
  if (!card) return null;
  const list = state.versions[card.id] ?? [];
  const last = list[list.length - 1];
  if (last && cardSignature(last.snapshot) === cardSignature(card)) return null;
  return saveVersion(undefined, { auto: true });
}

export async function persistActive(): Promise<void> {
  const card = activeCard();
  if (!card) return;
  await db.saveCard(card);
  notify({ dirty: false });
}

export async function flushPendingSave(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
    await persistActive();
  }
}

export async function initStore(): Promise<void> {
  let project = await db.loadAll();
  if (!project || project.cards.length === 0) {
    const card = newCard(100, 140, '识字卡');
    project = { cards: [card], versions: {}, activeCardId: card.id };
    await db.saveCard(card);
  }
  state.cards = project.cards;
  state.versions = project.versions;
  state.activeCardId = project.activeCardId;
  if (!state.cards.some((c) => c.id === state.activeCardId)) state.activeCardId = state.cards[0].id;
  notify();
}

export async function createCard(w = 100, h = 140): Promise<Card> {
  const card = newCard(w, h, '新卡片');
  state.cards.push(card);
  state.activeCardId = card.id;
  state.selectedIds = [];
  await db.saveCard(card);
  notify();
  return card;
}

export async function duplicateCard(id: string): Promise<void> {
  const src = state.cards.find((c) => c.id === id);
  if (!src) return;
  const copy = cloneCard(src);
  copy.id = uid('card');
  copy.title = `${src.title} 副本`;
  copy.updatedAt = Date.now();
  state.cards.push(copy);
  state.activeCardId = copy.id;
  await db.saveCard(copy);
  notify();
}

export async function removeCard(id: string): Promise<void> {
  if (state.cards.length <= 1) {
    notify({ status: '至少要保留一张卡片' });
    return;
  }
  state.cards = state.cards.filter((c) => c.id !== id);
  if (state.activeCardId === id) state.activeCardId = state.cards[0].id;
  await db.deleteCardRecord(id);
  notify();
}

export function setActiveCard(id: string): void {
  state.activeCardId = id;
  state.selectedIds = [];
  notify();
}

/** Snapshots the active card into a new version. */
export async function saveVersion(
  label?: string,
  opts: { auto?: boolean } = {},
): Promise<Version | null> {
  const card = activeCard();
  if (!card) return null;
  await flushPendingSave();
  const list = state.versions[card.id] ?? (state.versions[card.id] = []);
  const v: Version = {
    id: uid('v'),
    cardId: card.id,
    ts: Date.now(),
    label: label ?? `版本 ${list.length + 1}`,
    starred: false,
    snapshot: cloneCard(card),
  };
  list.push(v);
  list.sort((a, b) => a.ts - b.ts);
  await db.putVersion(v);
  if (opts.auto) notify();
  else notify({ status: `已保存 ${v.label}` });
  return v;
}

export async function restoreVersion(versionId: string): Promise<void> {
  const card = activeCard();
  if (!card) return;
  const v = (state.versions[card.id] ?? []).find((x) => x.id === versionId);
  if (!v) return;
  // Restore in place so element ids stay stable and history remains coherent.
  const snap = cloneCard(v.snapshot);
  const restored: Card = {
    ...snap,
    id: card.id,
    updatedAt: Date.now(),
  };
  const idx = state.cards.findIndex((c) => c.id === card.id);
  state.cards[idx] = restored;
  state.selectedIds = [];
  await db.saveCard(restored);
  notify({ status: `已回到 ${v.label}` });
}

export async function renameVersion(id: string, label: string): Promise<void> {
  const card = activeCard();
  if (!card) return;
  const v = (state.versions[card.id] ?? []).find((x) => x.id === id);
  if (!v) return;
  v.label = label;
  await db.putVersion(v);
  notify();
}

export async function starVersion(id: string): Promise<void> {
  const card = activeCard();
  if (!card) return;
  const v = (state.versions[card.id] ?? []).find((x) => x.id === id);
  if (!v) return;
  v.starred = !v.starred;
  await db.putVersion(v);
  notify();
}

export async function deleteVersion(id: string): Promise<void> {
  const card = activeCard();
  if (!card) return;
  const list = state.versions[card.id] ?? [];
  state.versions[card.id] = list.filter((v) => v.id !== id);
  if (state.diff.a === id) state.diff.a = null;
  if (state.diff.b === id) state.diff.b = null;
  await db.deleteVersionRecord(id);
  notify();
}

export function selectElements(ids: string[]): void {
  state.selectedIds = ids;
  notify();
}

export function toggleSelect(id: string, additive: boolean): void {
  if (!additive) {
    state.selectedIds = [id];
  } else if (state.selectedIds.includes(id)) {
    state.selectedIds = state.selectedIds.filter((s) => s !== id);
  } else {
    state.selectedIds = [...state.selectedIds, id];
  }
  notify();
}

export function setDiff(a: string | null, b: string | null): void {
  state.diff = { a, b };
  notify();
}

export function setView(view: AppState['view']): void {
  state.view = view;
  notify();
}

export function setStatus(status: string): void {
  notify({ status });
}

/** Re-seeds the paper blobs, keeping the pattern but changing the arrangement. */
export function reshuffleBackground(): void {
  mutateCard((card) => {
    const seed = Math.floor(Math.random() * 1e9);
    card.bg.seed = seed;
    card.bg.blobs = generateBlobs(card.w, card.h, seed, card.bg.pattern);
  });
}

export function resetBackground(): void {
  mutateCard((card) => {
    card.bg = defaultBackground(card.w, card.h);
  });
}

export function resetStyle(): void {
  mutateCard((card) => {
    card.style = defaultStyle();
  });
}

/** Adds an element and selects it. */
export function addElement(el: Element): void {
  mutateCard((card) => {
    card.elements.push(el);
  });
  selectElements([el.id]);
}

export function removeSelected(): void {
  const card = activeCard();
  if (!card) return;
  mutateCard((c) => {
    c.elements = c.elements.filter((e) => !state.selectedIds.includes(e.id));
  });
  state.selectedIds = [];
  notify();
}

export function selectedElement(): Element | null {
  const card = activeCard();
  if (!card) return null;
  return card.elements.find((e) => e.id === state.selectedIds[0]) ?? null;
}

export function replaceProject(project: Project): void {
  state.cards = project.cards;
  state.versions = project.versions;
  state.activeCardId = project.cards[0]?.id ?? '';
  state.selectedIds = [];
  notify();
}

export function projectPayload(): Project {
  return {
    cards: state.cards,
    versions: state.versions,
    activeCardId: state.activeCardId,
  };
}

/** Keeps element paths warm so renders after a load do not flash empty. */
export function warmGeometry(card: Card): void {
  for (const el of card.elements) {
    void elementPath(el);
  }
}

/** Smallest contour gap among the card's ink elements, for the inspector read-out. */
export function minGapOf(card: Card): number {
  const glyphs = card.elements.filter((e) => e.type === 'glyph');
  let best = Infinity;
  for (let i = 0; i < glyphs.length; i++) {
    for (let j = i + 1; j < glyphs.length; j++) {
      const a = glyphs[i];
      const b = glyphs[j];
      const fa = elementField(a);
      for (const ring of elementRings(b)) {
        const stride = Math.max(1, Math.round(ring.length / 2 / 64));
        for (let k = 0; k < ring.length; k += 2 * stride) {
          const d = fa.value(ring[k], ring[k + 1]);
          if (d < best) best = d;
        }
      }
    }
  }
  return best;
}

/** Label of the most recent version for a card, or a dash. */
export function activeVersionLabel(cardId: string): string {
  const list = state.versions[cardId] ?? [];
  if (list.length === 0) return '—';
  return list[list.length - 1].label;
}
