// 排查调试深度图全黑：临时自检脚本，输出 RTT 回读像素
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-gpu', '--use-gl=angle', '--use-angle=gl', ''],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warn') console.log(`[${m.type()}]`, m.text().slice(0, 200));
});
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4000));

// 探针模式：固定中心 texel，ref 沿屏幕 x 扫，找翻转点
await page.evaluate(() => {
  window.__debugDepthMode = 2;
  document.querySelector('button.btn-debug').click();
});
await new Promise((r) => setTimeout(r, 4000));

// 固定中心 texel，ref 沿屏幕 x 扫描，观察 R 通道翻转
const transition = await page.evaluate(() => {
  const c = document.querySelectorAll('.debug-card canvas')[0];
  const ctx = c.getContext('2d');
  const pts = [];
  for (let fx = 0.05; fx <= 0.98; fx += 0.08) {
    const d = ctx.getImageData(Math.round(c.width * fx), Math.round(c.height * 0.5), 1, 1).data;
    pts.push([Number(fx.toFixed(2)), d[0]]);
  }
  return pts;
});
console.log('REF SWEEP R (ref, red):', JSON.stringify(transition));

// 直接读调试 canvas 上的像素
const pixels = await page.evaluate(() => {
  const cs = document.querySelectorAll('.debug-card canvas');
  return [...cs].map((c) => {
    const ctx = c.getContext('2d');
    const probes = [
      ['center', c.width / 2, c.height / 2],
      ['topleft', 10, 10],
      ['topright', c.width - 10, 10],
      ['botleft', 10, c.height - 10],
      ['botright', c.width - 10, c.height - 10],
      ['q1', c.width * 0.25, c.height * 0.25],
      ['q3', c.width * 0.75, c.height * 0.75],
    ];
    const out = {};
    for (const [name, x, y] of probes) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      out[name] = [d[0], d[1], d[2]];
    }
    // 整张图的均值与最大值
    const all = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    let max = 0;
    let nonzero = 0;
    const hist = new Array(11).fill(0);
    for (let i = 0; i < all.length; i += 4) {
      const v = all[i];
      sum += v;
      if (v > max) max = v;
      if (v > 5) nonzero++;
      hist[Math.min(10, Math.floor(v / 24))]++;
    }
    out._mean = Math.round(sum / (all.length / 4));
    out._max = max;
    out._nonzeroPct = Math.round((nonzero / (all.length / 4)) * 1000) / 10;
    out._hist = hist;
    return out;
  });
});
console.log('DEBUG CANVAS PIXELS:', JSON.stringify(pixels, null, 1));

await page.screenshot({ path: 'test-shots/debug-diag.png' });
await browser.close();
