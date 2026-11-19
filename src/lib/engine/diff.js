// 两版立面对比：新增 / 删除 / 移动 / 未变
const GEOM_KEYS_DEVICE = ['x', 'y', 'w', 'h', 'model'];
const GEOM_KEYS_PIPE = ['x1', 'y1', 'x2', 'y2', 'diameter'];

export function diffFacade(oldFac, newFac) {
  const a = index(oldFac);
  const b = index(newFac);
  const items = [];

  for (const [id, el] of b) {
    const before = a.get(id);
    if (!before) {
      items.push({ id, kind: el.kind, status: 'added', before: null, after: el });
    } else {
      const keys = el.kind === 'pipe' ? GEOM_KEYS_PIPE : GEOM_KEYS_DEVICE;
      const moved = keys.some((k) => Math.round((before[k] ?? 0) * 100) !== Math.round((el[k] ?? 0) * 100));
      items.push({
        id, kind: el.kind,
        status: moved ? 'moved' : 'same',
        before, after: el
      });
    }
  }
  for (const [id, el] of a) {
    if (!b.has(id)) items.push({ id, kind: el.kind, status: 'removed', before: el, after: null });
  }

  const counts = { added: 0, removed: 0, moved: 0, same: 0 };
  for (const it of items) counts[it.status]++;
  return { items, counts };
}

function index(fac) {
  const m = new Map();
  for (const d of fac?.devices || []) m.set(d.id, d);
  for (const p of fac?.pipes || []) m.set(p.id, p);
  return m;
}
