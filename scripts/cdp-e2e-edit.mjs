// 交互 E2E：批量换型号 + 框选 + 导出 SVG/报告
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

await send('Page.navigate', { url: 'http://127.0.0.1:5174/#/edit' });
await sleep(2500);

// 1) 批量换型号：脱硫塔 TL-600 → TL-1200
const swap = await evalJs(`(async () => {
  const before = JSON.parse(localStorage.getItem('fgh-workbench-v1'));
  const ver0 = before.projects[0].versions[before.projects[0].versions.length - 1].facade;
  const w0 = ver0.devices.find(d => d.type === 'desulf').w;
  // 打开脱硫塔换型弹窗
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '脱硫塔').click();
  await new Promise(r => setTimeout(r, 200));
  const modal = document.querySelector('.modal');
  const selects = modal.querySelectorAll('select');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(selects[1], 'TL-1200');
  selects[1].dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 100));
  [...modal.querySelectorAll('button')].find(b => b.textContent.includes('应用更换')).click();
  await new Promise(r => setTimeout(r, 300));
  const after = JSON.parse(localStorage.getItem('fgh-workbench-v1'));
  const ver1 = after.projects[0].versions[after.projects[0].versions.length - 1].facade;
  const d = ver1.devices.find(x => x.type === 'desulf');
  return JSON.stringify({ wBefore: w0, wAfter: d.w, modelAfter: d.model, allSwapped: ver1.devices.filter(x=>x.type==='desulf').every(x=>x.model==='TL-1200') });
})()`);
console.log('1) 批量换型号:', swap);

// 2) 框选：在画布空白处拖一个大矩形
const marquee = await evalJs(`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const svg = document.querySelector('.canvas-wrap svg');
  const r = svg.getBoundingClientRect();
  const opts = (x, y, buttons = 1) => ({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 2, pointerType: 'mouse', isPrimary: true, button: 0, buttons, view: window });
  svg.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + 60, r.top + 40)));
  await wait(50);
  // 从左上空白拖到右下，覆盖整个画布中部的设备带
  for (let i = 1; i <= 10; i++) {
    window.dispatchEvent(new PointerEvent('pointermove', opts(r.left + 60 + i * 95, r.top + 40 + i * 62)));
    await wait(20);
  }
  await wait(50);
  window.dispatchEvent(new PointerEvent('pointerup', opts(r.left + 1010, r.top + 660, 0)));
  await wait(300);
  const selCount = document.querySelectorAll('.roster tr.selected').length;
  return JSON.stringify({ selectedRows: selCount });
})()`);
console.log('2) 框选:', marquee);

// 3) 导出 SVG 与报告（拦截下载，校验内容）
const exports = await evalJs(`(async () => {
  const results = {};
  const origCreate = URL.createObjectURL;
  let captured = [];
  URL.createObjectURL = (blob) => { captured.push(blob); return 'blob:fake'; };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function() { this.__clicked = true; };
  // 编辑页导出按钮
  const svgBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '导出 SVG');
  svgBtn.click();
  await new Promise(r => setTimeout(r, 150));
  const svgBlob = captured[captured.length - 1];
  results.svgType = svgBlob?.type;
  results.svgHasSvg = (await svgBlob.text()).includes('<svg') && (await svgBlob.text()).includes('脱硫');
  const repBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '巡检报告');
  repBtn.click();
  await new Promise(r => setTimeout(r, 150));
  const repBlob = captured[captured.length - 1];
  const repText = await repBlob.text();
  results.reportType = repBlob?.type;
  results.reportHasSections = repText.includes('巡检记录报告') && repText.includes('设备清册') && repText.includes('审核意见');
  URL.createObjectURL = origCreate;
  return JSON.stringify(results);
})()`);
console.log('3) 导出:', exports);

console.log('\n异常:', logs.length ? logs : '无');
ws.close();
process.exit(0);
