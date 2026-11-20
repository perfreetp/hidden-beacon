// 正常视图截图 + 偏暗场景测试
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
  if (m.type() === 'error' && !m.text().includes('404')) console.log(`[${m.type()}]`, m.text().slice(0, 160));
});
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4500));
await page.screenshot({ path: 'test-shots/normal-before.png' });

// 采样地板区域的实际亮度
const luma = await page.evaluate(() => {
  const c = document.querySelector('.scene-canvas');
  // 用 gl canvas 无法直接 2d 读，改用整体截图统计在 node 侧做
  return c.width + 'x' + c.height;
});
console.log('canvas:', luma);
await browser.close();
