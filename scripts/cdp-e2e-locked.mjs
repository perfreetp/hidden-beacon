// 核心需求 E2E：锁定局部在改总参数重生成后保持原样，其余按规则重排
const list = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = list.find((x) => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
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
async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.result.exceptionDetails) return { __error: res.result.exceptionDetails.text };
  return res.result.result.value;
}

// 用引擎直接构造：V1 锁一个设备，改开间数重生成，验证锁定保持
const result = await evalJs(`(async () => {
  const g = await import('/src/lib/engine/generate.js');
  const v1 = g.generate(g.DEFAULT_PARAMS);
  const lock = v1.devices.find(d => d.id === 'D-desulf-b0');
  const saved = { x: lock.x, y: lock.y, w: lock.w, h: lock.h };
  lock.x = 3.33; lock.locked = true;
  // 改总参数：开间 5→7、间距变化
  const v2 = g.generate({ ...g.DEFAULT_PARAMS, bays: 7, gap: 1.8 }, v1);
  const kept = v2.devices.find(d => d.id === 'D-desulf-b0');
  const unlocked = v2.devices.find(d => d.id === 'D-baghouse-b1');
  const v1Bag = v1.devices.find(d => d.id === 'D-baghouse-b1');
  // 再改一次，确认锁持续保持
  const v3 = g.generate({ ...g.DEFAULT_PARAMS, bays: 4 }, v2);
  const kept3 = v3.devices.find(d => d.id === 'D-desulf-b0');
  return JSON.stringify({
    lockedKeptV2: kept.x === 3.33 && kept.locked === true,
    lockedKeptV3: kept3.x === 3.33 && kept3.locked === true,
    unlockedRearranged: unlocked.x !== v1Bag.x,
    newBayHasDevices: v2.devices.some(d => d.bay === 6),
    orphanKeptOnShrink: v3.devices.some(d => d.id === 'D-desulf-b0' && d.locked),
    savedPos: saved
  });
})()`);
console.log('带锁重生成:', result);

// UI 层：生成页改开间后点重新生成，画布无异常且设备数变化
await send('Page.navigate', { url: 'http://127.0.0.1:5174/' });
await sleep(2200);
const ui = await evalJs(`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const before = document.querySelectorAll('.devices g[role="button"]').length;
  // 开间输入框改为 8
  const bayInput = document.querySelectorAll('input[type="number"]')[2];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(bayInput, '8');
  bayInput.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(100);
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('重新分格排布')).click();
  await wait(500);
  const after = document.querySelectorAll('.devices g[role="button"]').length;
  const okLine = document.querySelector('.okline')?.textContent || '';
  return JSON.stringify({ devicesBefore: before, devicesAfter: after, grew: after > before, okLine });
})()`);
console.log('UI 重生成:', ui);
console.log('异常:', logs.length ? logs : '无');
ws.close();
process.exit(0);
