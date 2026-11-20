// 诊断指针拾取与拖拽
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
page.on('console', (m) => { if (m.text().includes('[drag]')) console.log(m.text()); });
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4000));

const box = await page.$('.scene-canvas').then((c) => c.boundingBox());
console.log('canvas box:', JSON.stringify(box));

// 在多个候选点做拾取测试（用 babylon 的 pick 通过 window 不可直接访问，改为监听 pointer 事件 + 看选中环）
// 先扫描中心区域网格，找出点击后出现选中提示的位置
const probe = async (fx, fy) => {
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  await page.mouse.click(x, y);
  await new Promise((r) => setTimeout(r, 200));
  return page.evaluate(() => {
    const hint = document.querySelector('.selection-hint').textContent;
    return hint;
  });
};

const candidates = [
  [0.42, 0.55], [0.4, 0.5], [0.35, 0.5], [0.5, 0.55], [0.55, 0.6], [0.3, 0.55],
];
for (const [fx, fy] of candidates) {
  const hint = await probe(fx, fy);
  console.log(`probe (${fx},${fy}):`, hint);
}

// 完整拖拽序列，并监听过程中选中状态
const sx = box.x + box.width * 0.35;
const sy = box.y + box.height * 0.5;
await page.mouse.move(sx, sy);
await page.mouse.down();
const hintDuring = await page.evaluate(() => document.querySelector('.selection-hint').textContent);
console.log('hint right after down:', hintDuring);
for (let k = 1; k <= 6; k++) {
  await page.mouse.move(sx + k * 20, sy + k * 10, { steps: 3 });
}
const hintMid = await page.evaluate(() => document.querySelector('.selection-hint').textContent);
console.log('hint during move:', hintMid);
await page.mouse.up();
await new Promise((r) => setTimeout(r, 500));

const moved = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('shadow-theater-v1'));
  return raw.theaters.find((t) => t.id === raw.currentId).placements.map((p) => [p.kind, Number(p.x.toFixed(2)), Number(p.z.toFixed(2))]);
});
console.log('placements after drag:', JSON.stringify(moved));
await browser.close();
