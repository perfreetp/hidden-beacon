// 无头浏览器冒烟测试：加载页面、捕获错误、截图、切换调试视图
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:5180/';

const logs = [];
const errors = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--window-size=1440,900',
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 5000));

  // 1) 基础渲染检查：canvas 是否存在且有非空内容
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('.scene-canvas');
    if (!c) return { ok: false, reason: 'no canvas' };
    return { ok: true, width: c.width, height: c.height };
  });
  console.log('CANVAS:', JSON.stringify(canvasInfo));

  await page.screenshot({ path: 'test-shots/01-initial.png' });

  // 2) 检查 localStorage 持久化
  const storage = await page.evaluate(() => localStorage.getItem('shadow-theater-v1'));
  console.log('STORAGE:', storage ? 'present (' + storage.length + ' chars)' : 'MISSING');

  // 3) 打开调试视图
  const debugBtn = await page.$$('button.btn-debug');
  if (debugBtn.length === 0) throw new Error('debug button missing');
  await debugBtn[0].click();
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: 'test-shots/02-debug.png' });

  const debugCanvases = await page.$$eval('.debug-card canvas', (els) =>
    els.map((c) => ({ w: c.width, h: c.height })),
  );
  console.log('DEBUG CANVASES:', JSON.stringify(debugCanvases));

  // 4) 复制一个剧场
  const beforeTabs = await page.$$eval('.theater-tab', (els) => els.length);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('复制一份再改'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  const afterTabs = await page.$$eval('.theater-tab', (els) => els.length);
  console.log(`TABS: ${beforeTabs} -> ${afterTabs}`);
  await page.screenshot({ path: 'test-shots/03-duplicated.png' });

  // 5) 拖一下色温滑块
  await page.evaluate(() => {
    const sliders = document.querySelectorAll('.slider-input');
    const sunTemp = sliders[1]; // 日光色温
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(sunTemp, '8000');
    sunTemp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: 'test-shots/04-cooler-sun.png' });

  // 6) 刷新页面，验证状态还在
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 3000));
  const tabCountAfterReload = await page.$$eval('.theater-tab', (els) => els.length);
  console.log('TABS AFTER RELOAD:', tabCountAfterReload);
  await page.screenshot({ path: 'test-shots/05-reloaded.png' });

  console.log('\n--- CONSOLE ERRORS (' + errors.length + ') ---');
  for (const e of errors) console.log(e);
  console.log('\n--- ALL CONSOLE (last 15) ---');
  for (const l of logs.slice(-15)) console.log(l);
} finally {
  await browser.close();
}
