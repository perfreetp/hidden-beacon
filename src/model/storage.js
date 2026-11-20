// IndexedDB:模型参数、最近结果、导出文件记录
const DB_NAME = 'truss-array-cad';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_EXPORTS = 'exports';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const s = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORE_EXPORTS)) {
        const s = db.createObjectStore(STORE_EXPORTS, { keyPath: 'id', autoIncrement: true });
        s.createIndex('projectId', 'projectId');
        s.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(record) {
  const db = await openDb();
  const now = Date.now();
  const doc = {
    id: record.id ?? `proj-${now}`,
    name: record.name ?? '未命名桁架',
    params: record.params,
    stats: record.stats ?? null,
    modelMeta: record.modelMeta ?? null,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
  };
  await wrap(tx(db, STORE_PROJECTS, 'readwrite').put(doc));
  db.close();
  return doc;
}

export async function listProjects() {
  const db = await openDb();
  const req = tx(db, STORE_PROJECTS).index('updatedAt').getAll();
  const rows = await wrap(req);
  db.close();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id) {
  const db = await openDb();
  const row = await wrap(tx(db, STORE_PROJECTS).get(id));
  db.close();
  return row;
}

export async function deleteProject(id) {
  const db = await openDb();
  await wrap(tx(db, STORE_PROJECTS, 'readwrite').delete(id));
  db.close();
}

export async function saveExportRecord(rec) {
  const db = await openDb();
  const doc = {
    projectId: rec.projectId ?? null,
    part: rec.part, // 'beam' | 'tower'
    format: rec.format, // 'stl' | 'obj'
    blob: rec.blob,
    size: rec.blob.size,
    triangleCount: rec.triangleCount ?? null,
    createdAt: Date.now(),
  };
  const id = await wrap(tx(db, STORE_EXPORTS, 'readwrite').add(doc));
  db.close();
  return id;
}

export async function listExportRecords(projectId) {
  const db = await openDb();
  const store = tx(db, STORE_EXPORTS);
  const all = await wrap(store.getAll());
  db.close();
  return all
    .filter((r) => !projectId || r.projectId === projectId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
