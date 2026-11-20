// 最终效果验证：打开调试视图并截图
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
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4000));

await page.evaluate(() => document.querySelector('button.btn-debug').click());
await new Promise((r) => setTimeout(r, 5000));

const stats = await page.evaluate(() => {
  const out = [];
  for (let layer = 0; layer < 3; layer++) {
    const c = document.querySelectorAll('.debug-card canvas')[layer];
    if (!c) return out;
    const ctx = c.getContext('2d');
    const all = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, max = 0, min = 255;
    const total = all.length / 4;
    for (let i = 0; i < all.length; i += 4) {
      const v = all[i];
      sum += v; if (v > max) max = v; if (v < min) min = v;
    }
    out.push({ mean: Math.round(sum / total), min, max });
  }
  return out;
});
console.log('DEBUG DEPTH R stats:', JSON.stringify(stats));

await page.screenshot({ path: 'test-shots/final-debug.png' });
await browser.close();
