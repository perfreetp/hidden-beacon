// 隔离验证：全新数据下，单次拖拽只锁目标构件
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list.find((x) => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
await new Promise((r) => (ws.onopen = r));
function send(method, params = {}) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((r) => pending.set(mid, r));
}
await send('Runtime.enable');
await send('Page.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 直接在当前库上验证：点选单个目标再拖拽，只锁该构件
await send('Page.navigate', { url: 'http://127.0.0.1:5174/#/edit' });
await sleep(2500);

const probe = `(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 20; i++) {
    if (localStorage.getItem('fgh-workbench-v1')) break;
    await wait(150);
  }
  const before = JSON.parse(localStorage.getItem('fgh-workbench-v1'));
  const beforeLock = before.projects[0].versions.at(-1).facade.devices.filter(d => d.locked).length;
  const svg = document.querySelector('.canvas-wrap svg');
  // 选一个未锁定的布袋
  const g = [...svg.querySelectorAll('.devices g[role="button"]')].find(el => el.textContent.includes('BAGHOUSE') && !el.classList.contains('locked'));
  const r = g.getBoundingClientRect();
  const x0 = r.x + r.width / 2, y0 = r.y + r.height / 2;
  const opts = (x, y, buttons = 1) => ({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 4, pointerType: 'mouse', isPrimary: true, button: 0, buttons, view: window });
  g.dispatchEvent(new PointerEvent('pointerdown', opts(x0, y0)));
  await wait(60);
  for (let i = 1; i <= 6; i++) {
    window.dispatchEvent(new PointerEvent('pointermove', opts(x0 + i * 12, y0 + i * 8)));
    await wait(20);
  }
  window.dispatchEvent(new PointerEvent('pointerup', opts(x0 + 72, y0 + 48, 0)));
  await wait(400);
  const after = JSON.parse(localStorage.getItem('fgh-workbench-v1'));
  const f = after.projects[0].versions.at(-1).facade;
  return JSON.stringify({
    beforeLock,
    afterLockedDevices: f.devices.filter(d => d.locked).map(d => d.id),
    targetLocked: g.classList.contains('locked'),
    totalLocked: f.meta.lockedCount
  });
})()`;
const res = await send('Runtime.evaluate', { expression: probe, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(res.result, null, 1));
ws.close();
process.exit(0);
