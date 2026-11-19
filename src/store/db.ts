/**
 * IndexedDB persistence.
 *
 * Two stores: `cards` (current state, one record per card) and `versions`
 * (append-only snapshots, keyed by version id with a cardId index). Everything
 * is plain JSON, so a project can be exported as a single .json file too.
 */

import type { Card, Project, Version } from '../model/types';

const DB_NAME = 'zika-sdf-studio';
const DB_VERSION = 1;
const CARDS = 'cards';
const VERSIONS = 'versions';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CARDS)) {
        db.createObjectStore(CARDS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(VERSIONS)) {
        const s = db.createObjectStore(VERSIONS, { keyPath: 'id' });
        s.createIndex('cardId', 'cardId');
        s.createIndex('ts', 'ts');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function loadAll(): Promise<Project | null> {
  const cards = await tx<Card[]>(CARDS, 'readonly', (s) => s.getAll() as IDBRequest<Card[]>);
  if (!cards || cards.length === 0) return null;
  const versions = await tx<Version[]>(VERSIONS, 'readonly', (s) => s.getAll() as IDBRequest<Version[]>);
  const byCard: Record<string, Version[]> = {};
  for (const v of versions ?? []) {
    (byCard[v.cardId] ??= []).push(v);
  }
  for (const k of Object.keys(byCard)) byCard[k].sort((a, b) => a.ts - b.ts);
  cards.sort((a, b) => a.updatedAt - b.updatedAt);
  return { cards, versions: byCard, activeCardId: cards[0].id };
}

export async function saveCard(card: Card): Promise<void> {
  await tx(CARDS, 'readwrite', (s) => s.put(card));
}

export async function deleteCardRecord(id: string): Promise<void> {
  await tx(CARDS, 'readwrite', (s) => s.delete(id));
  const vs = await tx<Version[]>(VERSIONS, 'readonly', (s) => s.index('cardId').getAll(id) as IDBRequest<Version[]>);
  for (const v of vs ?? []) await tx(VERSIONS, 'readwrite', (s) => s.delete(v.id));
}

export async function putVersion(v: Version): Promise<void> {
  await tx(VERSIONS, 'readwrite', (s) => s.put(v));
}

export async function deleteVersionRecord(id: string): Promise<void> {
  await tx(VERSIONS, 'readwrite', (s) => s.delete(id));
}

/** Replaces the whole database with the given project (used by import). */
export async function replaceAll(project: Project): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([CARDS, VERSIONS], 'readwrite');
    t.objectStore(CARDS).clear();
    t.objectStore(VERSIONS).clear();
    for (const c of project.cards) t.objectStore(CARDS).put(c);
    for (const list of Object.values(project.versions)) for (const v of list) t.objectStore(VERSIONS).put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** Number of stored versions, for the storage footer. */
export async function storageStats(): Promise<{ cards: number; versions: number; bytes: number }> {
  const cards = await tx<Card[]>(CARDS, 'readonly', (s) => s.getAll() as IDBRequest<Card[]>);
  const versions = await tx<Version[]>(VERSIONS, 'readonly', (s) => s.getAll() as IDBRequest<Version[]>);
  const bytes = new Blob([JSON.stringify({ cards, versions })]).size;
  return { cards: cards?.length ?? 0, versions: versions?.length ?? 0, bytes };
}
