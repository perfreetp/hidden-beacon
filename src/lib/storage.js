// localStorage 持久化:存档 / 题目 / 成绩
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* 存储满或不可用时静默 */
  }
}

const K_ARCH = 'ng_archives';
const K_ASSIGN = 'ng_assignments';
const K_SUBS = 'ng_submissions';

export const storage = {
  listArchives: () => load(K_ARCH, []),
  saveArchive(a) {
    const list = load(K_ARCH, []);
    const i = list.findIndex((x) => x.id === a.id);
    if (i >= 0) list[i] = a;
    else list.push(a);
    save(K_ARCH, list);
  },
  deleteArchive(id) {
    save(K_ARCH, load(K_ARCH, []).filter((x) => x.id !== id));
  },

  listAssignments: () => load(K_ASSIGN, []),
  saveAssignment(a) {
    const list = load(K_ASSIGN, []);
    const i = list.findIndex((x) => x.id === a.id);
    if (i >= 0) list[i] = a;
    else list.push(a);
    save(K_ASSIGN, list);
  },
  deleteAssignment(id) {
    save(K_ASSIGN, load(K_ASSIGN, []).filter((x) => x.id !== id));
  },

  listSubmissions: () => load(K_SUBS, []),
  saveSubmission(s) {
    const list = load(K_SUBS, []);
    const i = list.findIndex((x) => x.id === s.id);
    if (i >= 0) list[i] = s;
    else list.push(s);
    save(K_SUBS, list);
  },
  deleteSubmission(id) {
    save(K_SUBS, load(K_SUBS, []).filter((x) => x.id !== id));
  }
};

export function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}
