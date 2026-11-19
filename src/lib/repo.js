// 档案仓库：localStorage 持久化的项目 / 版本 / 审核状态
import { writable } from 'svelte/store';
import { generate, DEFAULT_PARAMS } from './engine/generate.js';

const KEY = 'fgh-workbench-v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('档案读取失败', e);
  }
  return null;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function seedDemo() {
  // 演示数据：同一项目两个版本，含锁定局部与重生成差异
  const v1 = generate(DEFAULT_PARAMS);
  const dev0 = v1.devices.find((d) => d.id === 'D-desulf-b0');
  dev0.x = +(dev0.x + 1.1).toFixed(2);
  dev0.locked = true;
  const pipe0 = v1.pipes.find((p) => p.id === 'P-h-main-b1');
  pipe0.y1 = +(pipe0.y1 - 0.8).toFixed(2);
  pipe0.y2 = +(pipe0.y2 - 0.8).toFixed(2);
  pipe0.locked = true;

  const v2Params = { ...DEFAULT_PARAMS, bays: 6, gap: 1.5 };
  const v2 = generate(v2Params, v1);

  const now = Date.now();
  return {
    seq: 1,
    projects: [{
      id: 'PRJ-DEMO',
      name: '一号厂区烟气监测立面',
      area: DEFAULT_PARAMS.area,
      status: 'review',
      createdAt: new Date(now - 86400000 * 3).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString(),
      review: null,
      versions: [
        { id: 'V1', n: 1, note: '初始生成（5 开间）', createdAt: new Date(now - 86400000 * 3).toISOString(), facade: v1 },
        { id: 'V2', n: 2, note: '调整为 6 开间、设备间距 1.5m，保留锁定局部', createdAt: new Date(now - 86400000).toISOString(), facade: v2 }
      ]
    }]
  };
}

const initial = load() || seedDemo();
const db = writable(initial);
db.subscribe((v) => {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { console.warn('档案保存失败', e); }
});

function deepCopy(v) {
  // 档案数据全为 JSON 可序列化对象；Svelte 5 会把 store 内部对象包成响应式代理，
  // 该代理无法 structuredClone，统一用 JSON 深拷贝。
  return JSON.parse(JSON.stringify(v));
}

function mutate(fn) {
  db.update((state) => {
    const next = deepCopy(state);
    fn(next);
    return next;
  });
}

export const dbStore = db;

export function createProject({ name, area }, facade) {
  const id = uid('PRJ');
  const now = new Date().toISOString();
  mutate((s) => {
    s.projects.unshift({
      id, name, area: area || facade.params.area,
      status: 'editing', createdAt: now, updatedAt: now, review: null,
      versions: [{ id: uid('V'), n: 1, note: '初始生成', createdAt: now, facade }]
    });
  });
  return id;
}

export function addVersion(projectId, facade, note = '参数调整重生成') {
  let vid = null;
  mutate((s) => {
    const prj = s.projects.find((p) => p.id === projectId);
    if (!prj) return;
    vid = uid('V');
    prj.versions.push({
      id: vid, n: prj.versions.length + 1, note,
      createdAt: new Date().toISOString(), facade
    });
    prj.updatedAt = new Date().toISOString();
    prj.status = 'review';
    prj.review = null;
  });
  return vid;
}

export function saveFacade(projectId, versionId, facade) {
  mutate((s) => {
    const prj = s.projects.find((p) => p.id === projectId);
    const ver = prj?.versions.find((v) => v.id === versionId);
    if (ver) {
      ver.facade = facade;
      prj.updatedAt = new Date().toISOString();
    }
  });
}

export function submitReview(projectId, decision, comment) {
  mutate((s) => {
    const prj = s.projects.find((p) => p.id === projectId);
    if (!prj) return;
    prj.review = { decision, comment, decidedAt: new Date().toISOString(), reviewer: '组长' };
    prj.status = decision === 'approved' ? 'archived' : 'editing';
    prj.updatedAt = new Date().toISOString();
  });
}

export function archiveProject(projectId) {
  mutate((s) => {
    const prj = s.projects.find((p) => p.id === projectId);
    if (prj) { prj.status = 'archived'; prj.updatedAt = new Date().toISOString(); }
  });
}

export function deleteProject(projectId) {
  mutate((s) => {
    s.projects = s.projects.filter((p) => p.id !== projectId);
  });
}

export function renameProject(projectId, name) {
  mutate((s) => {
    const prj = s.projects.find((p) => p.id === projectId);
    if (prj) prj.name = name;
  });
}

export function getProject(projectId) {
  let found = null;
  db.subscribe((s) => {
    found = s.projects.find((p) => p.id === projectId) || null;
  })();
  return found ? deepCopy(found) : null;
}

export function latestVersion(projectId) {
  const prj = getProject(projectId);
  if (!prj || !prj.versions.length) return null;
  return prj.versions[prj.versions.length - 1];
}
