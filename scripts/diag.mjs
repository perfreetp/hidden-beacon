// 排查调试深度图：测量 recoverDepth 正常模式的输出
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('depth-range') || (m.type() === 'error' && !t.includes('404'))) console.log(`[${m.type()}]`, t.slice(0, 200));
});
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4000));

await page.evaluate(() => {
  window.__debugDepthMode = 3; // 正常 recoverDepth 模式
  window.__depthLog = true;
  document.querySelector('button.btn-debug').click();
});
await new Promise((r) => setTimeout(r, 5000));

const stats = await page.evaluate(() => {
  const out = [];
  for (let layer = 0; layer < 3; layer++) {
    const c = document.querySelectorAll('.debug-card canvas')[layer];
    if (!c) return out;
    const ctx = c.getContext('2d');
    const all = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0; let max = 0; let min = 255;
    const hist = new Array(8).fill(0);
    const total = all.length / 4;
    for (let i = 0; i < all.length; i += 4) {
      const v = all[i];
      sum += v; if (v > max) max = v; if (v < min) min = v;
      hist[Math.min(7, Math.floor(v / 32))]++;
    }
    out.push({ mean: Math.round(sum / total), min, max, histPct: hist.map((n) => Number((n / total * 100).toFixed(1))) });
  }
  return out;
});
console.log('RECOVERED DEPTH per layer (R channel):', JSON.stringify(stats, null, 1));

await page.screenshot({ path: 'test-shots/depth-normal.png' });
await browser.close();
