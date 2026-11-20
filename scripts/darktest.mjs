// 偏暗提示测试：关灯制造黑暗，验证 DarkHint 弹出
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
page.on('console', (m) => { if (m.text().includes('[bright]')) console.log(m.text()); });
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4000));

// 关掉日光和台灯两个 Toggle（前两个 .toggle）
await page.evaluate(() => {
  const toggles = document.querySelectorAll('.toggle');
  toggles[0].click(); // 日光
  toggles[1].click(); // 台灯
});
console.log('both lights switched off, waiting for dark detection...');

// 逐步观察提示出现
let shown = false;
for (let i = 0; i < 25; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  shown = await page.evaluate(() => {
    const hint = document.querySelector('.dark-hint');
    return hint ? hint.classList.contains('show') : false;
  });
  if (shown) {
    console.log(`dark hint appeared after ~${i + 1}s`);
    break;
  }
}
console.log('DarkHint shown:', shown);
await page.screenshot({ path: 'test-shots/dark-hint.png' });

// 点“一键变亮”后提示应消失
if (shown) {
  await page.evaluate(() => [...document.querySelectorAll('.dark-hint button')].find((b) => b.textContent.includes('变亮')).click());
  await new Promise((r) => setTimeout(r, 2500));
  const stillShown = await page.evaluate(() => document.querySelector('.dark-hint').classList.contains('show'));
  console.log('hint after brighten:', stillShown);
}
await browser.close();
