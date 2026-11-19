// 交互 E2E：审核通过归档 + 档案检索过滤 + 图层切换 + 批量换型号
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
async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.result.exceptionDetails) return { __error: res.result.exceptionDetails.text };
  return res.result.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) 审核页：点"通过并归档"
await send('Page.navigate', { url: 'http://127.0.0.1:5174/#/review' });
await sleep(2500);
const approve = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find(x => x.textContent.includes('通过并归档'));
  if (!b || b.disabled) return 'button missing/disabled';
  b.click();
  return 'clicked';
})()`);
console.log('1) 审核通过按钮:', approve);
await sleep(600);
const afterApprove = await evalJs(`(() => {
  const db = JSON.parse(localStorage.getItem('fgh-workbench-v1'));
  const p = db.projects[0];
  return JSON.stringify({ status: p.status, decision: p.review?.decision, comment: p.review?.comment });
})()`);
console.log('   归档状态:', afterApprove);

// 2) 档案页：检索条件过滤
await send('Page.navigate', { url: 'http://127.0.0.1:5174/#/archive' });
await sleep(2000);
const archive = await evalJs(`(() => {
  const cards = document.querySelectorAll('.card').length;
  // 输入参数检索关键词
  const input = document.querySelector('input[placeholder*="FLUE"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'FLUE-2026');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return JSON.stringify({ initialCards: cards });
})()`);
console.log('2) 档案页:', archive);
await sleep(400);
const filtered = await evalJs(`document.querySelectorAll('.card').length`);
console.log('   参数过滤后命中卡片数:', filtered);

// 3) 生成页：图层切换
await send('Page.navigate', { url: 'http://127.0.0.1:5174/' });
await sleep(2000);
const layer = await evalJs(`(() => {
  const before = document.querySelectorAll('.pipes g').length;
  const btn = [...document.querySelectorAll('.toggle')].find(x => x.textContent.trim() === '管线');
  btn.click();
  return JSON.stringify({ pipesBefore: before });
})()`);
await sleep(300);
const layerAfter = await evalJs(`JSON.stringify({ pipesAfter: document.querySelectorAll('.pipes g').length, btnOff: [...document.querySelectorAll('.toggle')].find(x=>x.textContent.trim()==='管线').classList.contains('off') })`);
console.log('3) 图层隐藏:', layer, '->', layerAfter);

// 4) 确定性：同参数两次生成的 SVG 几何一致
const determinism = await evalJs(`(async () => {
  const m = await import('/src/lib/engine/generate.js');
  const a = m.generate(m.DEFAULT_PARAMS);
  const b = m.generate(m.DEFAULT_PARAMS);
  return JSON.stringify({ same: JSON.stringify(a) === JSON.stringify(b), devices: a.devices.length, pipes: a.pipes.length });
})()`);
console.log('4) 确定性:', determinism);

console.log('\n异常日志:', logs.length ? logs : '无');
ws.close();
process.exit(0);
