// 冒烟测试:驱动本机 Chrome 打开页面,收集控制台错误并截图
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://localhost:4519/';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-first-run', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console.error] ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000)); // 等瓦片加载

const info = await page.evaluate(() => {
  const app = document.querySelector('terrain-app');
  const sr = app?.shadowRoot;
  const q = (sel) => sr?.querySelector(sel);
  const hudText = q('terrain-hud')?.shadowRoot?.querySelector('.panel')?.textContent ?? '(hud empty)';
  const monText = q('tile-monitor')?.shadowRoot?.querySelector('#list')?.textContent ?? '(monitor empty)';
  return {
    hudText,
    monText,
    tiles: app.tm?.loadedCount,
    camY: Math.round(app.camera?.position.y),
  };
});
console.log('HUD:', info.hudText);
console.log('MONITOR:', info.monText);
console.log('TILES:', info.tiles, 'camY:', info.camY);
console.log('ERRORS:', errors.length ? '\n' + errors.slice(0, 10).join('\n') : 'none');

await page.screenshot({ path: process.env.TEMP + '\\terrain-smoke.png' });
await browser.close();
