// 交互 E2E：拖拽设备 → 验证自动加锁与坐标吸附 → 审核通过 → 归档状态
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

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.result.exceptionDetails) return { __error: res.result.exceptionDetails.text };
  return res.result.result.value;
}

// 导航到编辑页并等渲染
await send('Page.navigate', { url: 'http://127.0.0.1:5174/#/edit' });
await new Promise((r) => setTimeout(r, 2500));

// 取一个未锁定设备的屏幕位置
const target = await evalJs(`(() => {
  const svg = document.querySelector('.canvas-wrap svg');
  const g = [...svg.querySelectorAll('.devices g[role="button"]')].find(el => !el.classList.contains('locked'));
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), code: g.textContent.slice(0, 20) };
})()`);
console.log('拖拽目标:', JSON.stringify(target));

// 派发 pointer 事件序列（pointerdown → 移动 → up），位移 80px
const dragExpr = `(async () => {
  const svg = document.querySelector('.canvas-wrap svg');
  const g = [...svg.querySelectorAll('.devices g[role="button"]')].find(el => !el.classList.contains('locked'));
  const r = g.getBoundingClientRect();
  const x0 = r.x + r.width / 2, y0 = r.y + r.height / 2;
  const opts = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 });
  g.dispatchEvent(new PointerEvent('pointerdown', opts(x0, y0)));
  await new Promise(r => setTimeout(r, 50));
  for (let i = 1; i <= 8; i++) {
    window.dispatchEvent(new PointerEvent('pointermove', opts(x0 + i * 10, y0 + i * 6)));
    await new Promise(r => setTimeout(r, 20));
  }
  await new Promise(r => setTimeout(r, 50));
  window.dispatchEvent(new PointerEvent('pointerup', opts(x0 + 80, y0 + 48)));
  await new Promise(r => setTimeout(r, 400));
  const nowLocked = g.classList.contains('locked');
  const lockFlag = !!g.querySelector('.lock-flag');
  return JSON.stringify({ nowLocked, lockFlag, classes: g.getAttribute('class') });
})()`;
const dragResult = await evalJs(dragExpr);
console.log('拖拽后:', dragResult);

// 验证 localStorage 里该设备已 locked
const stored = await evalJs(`(() => {
  const db = JSON.parse(localStorage.getItem('fgh-workbench-v1'));
  const prj = db.projects[0];
  const ver = prj.versions[prj.versions.length - 1];
  const lockedDevs = ver.facade.devices.filter(d => d.locked).map(d => d.id);
  const lockedPipes = ver.facade.pipes.filter(p => p.locked).map(p => p.id);
  return JSON.stringify({ projectStatus: prj.status, lockedDevs, lockedPipes });
})()`);
console.log('持久化:', stored);

ws.close();
process.exit(0);
