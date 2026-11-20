// 端到端冒烟:headless Chrome + CDP(原生 WebSocket,无第三方依赖)
import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9222;
const targetUrl = process.argv[2];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/Administrator/AppData/Local/Temp/chrome-e2e-profile-2',
  'about:blank',
]);

try {
  let target;
  for (let i = 0; i < 30; i += 1) {
    try {
      const list = await getJSON('/json');
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch { /* retry */ }
    await sleep(500);
  }
  if (!target) throw new Error('no devtools target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let msgId = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method) {
      events.push(m);
    }
  };
  function send(method, params = {}) {
    const id = ++msgId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  const waitFor = async (predicate, timeoutMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const found = events.find(predicate);
      if (found) return found;
      await sleep(100);
    }
    throw new Error('timeout waiting for event');
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Console.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: 'C:/Users/Administrator/AppData/Local/Temp/chrome-e2e-dl' });

  const consoleLogs = [];
  const consoleErrors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      consoleLogs.push({ level: m.params.type, text });
      if (m.params.type === 'error') consoleErrors.push(text);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails.exception?.description ?? 'exception');
    }
  });

  await send('Page.navigate', { url: targetUrl });
  await waitFor((m) => m.method === 'Page.loadEventFired', 20000);
  await sleep(2000);

  // 在页面里执行完整交互:点击生成、等待结果、检查统计、导出
  const result = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const out = { steps: [] };
      const $ = (sel) => document.querySelector(sel);
      const $$ = (sel) => [...document.querySelectorAll(sel)];
      out.title = document.title;
      // 1. 点击生成实体
      $('.build-btn').click();
      out.steps.push('build clicked');
      // 等待顶部三角面数出现非占位值
      const t0 = Date.now();
      while (Date.now() - t0 < 60000) {
        const tri = $('.stats .stat-value')?.textContent;
        if (tri && tri !== '—' && Number(tri.replace(/,/g,'')) > 0) break;
        await new Promise(r => setTimeout(r, 300));
      }
      const stats = $$('.stat').map(s => ({
        label: s.querySelector('.stat-label').textContent,
        value: s.querySelector('.stat-value').textContent,
      }));
      out.statsAfterBuild = stats;
      out.triangles = Number(stats[0].value.replace(/,/g,''));
      // 2. 检查 IndexedDB
      const dbs = await indexedDB.databases();
      out.idbNames = dbs.map(d => d.name);
      // 3. canvas 数量(双视口)
      out.canvasCount = $$('canvas').length;
      // 4. 切到导出页,等待拆分实体加载
      $$('.tab')[1].click();
      const tParts = Date.now();
      while (Date.now() - tParts < 60000) {
        if (($('.export-card .export-stats')?.textContent || '').includes('三角面')) break;
        await new Promise(r => setTimeout(r, 300));
      }
      out.exportCards = $$('.export-card').length;
      out.partStats = $('.export-card .export-stats')?.textContent;
      // headless 下抑制真实下载,只验证文件生成与 IndexedDB 记录
      HTMLAnchorElement.prototype.click = function () { window.__dlCount = (window.__dlCount || 0) + 1; };
      URL.createObjectURL = () => 'blob:stub';
      // 5. 点横梁 STL 导出
      $('.export-card .export-btn').click();
      const t1 = Date.now();
      while (Date.now() - t1 < 30000) {
        if ($$('.export-history tbody tr').length > 0) break;
        await new Promise(r => setTimeout(r, 200));
      }
      out.exportHistoryRows = $$('.export-history tbody tr').length;
      out.exportHistoryText = $('.export-history tbody tr')?.textContent.replace(/\\s+/g,' ').trim();
      // 6. 再点 OBJ
      $$('.export-card .export-btn')[1].click();
      const t2 = Date.now();
      while (Date.now() - t2 < 30000) {
        if ($$('.export-history tbody tr').length >= 2) break;
        await new Promise(r => setTimeout(r, 200));
      }
      out.exportHistoryRowsAfterObj = $$('.export-history tbody tr').length;
      return out;
    })()`,
  });

  console.log(JSON.stringify(result.result.value, null, 2));
  if (consoleErrors.length) {
    console.log('\\nCONSOLE ERRORS:');
    consoleErrors.forEach((e) => console.log(' -', e.split('\n')[0]));
  }
  ws.close();
  chrome.kill();
  if (result.result.value.triangles <= 0) process.exit(1);
} catch (e) {
  chrome.kill();
  console.error('E2E FAILED:', e.message);
  process.exit(1);
}
