import { spawn } from 'node:child_process';
import http from 'node:http';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9263;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(p) {
  return new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}${p}`, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--window-size=1600,1000',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/Administrator/AppData/Local/Temp/chrome-cdp2',
  'about:blank',
]);
const round = (v) => Math.round(v);
try {
  let t;
  for (let i = 0; i < 30; i += 1) {
    try {
      const l = await getJSON('/json');
      t = l.find((x) => x.type === 'page');
      if (t) break;
    } catch { /* retry */ }
    await sleep(500);
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pend = new Map();
  const logs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const { resolve, reject } = pend.get(m.id);
      pend.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown')
      logs.push((m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split('\n').slice(0, 4).join(' '));
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pend.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = (expression) => send('Runtime.evaluate', { returnByValue: true, expression });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: process.argv[2] });
  await sleep(2500);
  await ev("document.querySelector('.build-btn').click()");
  for (let i = 0; i < 60; i += 1) {
    await sleep(500);
    const v = (await ev("document.querySelectorAll('.stat-value')[0].textContent")).result.value;
    if (v && v !== '—' && Number(v.replace(/,/g, '')) > 0) break;
  }
  await sleep(1500);

  // ---- 联动旋转:比较两视口控制器 spherical ----
  const before = (await ev('window.__viewports.map(v=>({theta:v.orbit.spherical.theta,phi:v.orbit.spherical.phi}))')).result.value;
  console.log('spherical before:', JSON.stringify(before));
  const rects = (await ev(`[...document.querySelectorAll('canvas')].map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})`)).result.value;
  const a = rects[0];
  const cx = round(a.x + a.w / 2);
  const cy = round(a.y + a.h / 2);
  console.log('rect A:', JSON.stringify(a), 'cx/cy:', cx, cy, typeof cx, typeof cy);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
  for (let k = 1; k <= 6; k += 1) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: round(cx + k * 20), y: round(cy + k * 10),
      button: 'left', buttons: 1,
    });
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: round(cx + 120), y: round(cy + 60), button: 'left', buttons: 0, clickCount: 1 });
  await sleep(600);
  const after = (await ev('window.__viewports.map(v=>({theta:v.orbit.spherical.theta,phi:v.orbit.spherical.phi}))')).result.value;
  console.log('spherical after :', JSON.stringify(after));
  const aChanged = Math.abs(after[0].theta - before[0].theta) > 0.01 || Math.abs(after[0].phi - before[0].phi) > 0.01;
  const bSynced = Math.abs(after[1].theta - after[0].theta) < 1e-6 && Math.abs(after[1].phi - after[0].phi) < 1e-6;
  console.log('viewport A rotated:', aChanged, '| viewport B synced:', bSynced);

  // ---- 杆件拾取 ----
  const pr = rects[0];
  let picked = false;
  for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.5], [0.6, 0.45], [0.5, 0.6], [0.35, 0.5], [0.65, 0.55]]) {
    const px = round(pr.x + pr.w * fx);
    const py = round(pr.y + pr.h * fy);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(400);
    if ((await ev("!!document.querySelector('.member-editor')")).result.value) { picked = true; break; }
  }
  console.log('member picked:', picked);
  const label = (await ev("document.querySelector('.member-editor h4')?.textContent ?? null")).result.value;
  console.log('selected:', label);
  if (picked) {
    const beforeMs = (await ev("document.querySelectorAll('.stat-value')[2].textContent")).result.value;
    await ev(`(function(){const inp=document.querySelector('.member-editor input[type=number]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,Number(inp.value)*1.3);inp.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.member-editor form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()`);
    for (let i = 0; i < 60; i += 1) {
      await sleep(400);
      const tt = (await ev("document.querySelectorAll('.stat-value')[2].textContent")).result.value;
      if (tt !== beforeMs) break;
    }
    const afterMs = (await ev("document.querySelectorAll('.stat-value')[2].textContent")).result.value;
    const banner = (await ev("document.querySelector('.overlay-banner.ok')?.textContent ?? null")).result.value;
    console.log('boolean ms:', beforeMs, '->', afterMs);
    console.log('incremental banner:', banner);
  }
  console.log('EXCEPTIONS:', logs.join(' | ') || '(none)');
  ws.close();
} finally {
  chrome.kill();
}
