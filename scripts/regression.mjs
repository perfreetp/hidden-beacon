// 完整交互回归：拖拽、滑块、分辨率重建、偏暗提示、切换/复制剧场、刷新持久化
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const errors = [];
const results = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
});

await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4500));

const canvasBox = await page.$('.scene-canvas').then((c) => c.boundingBox());

// 1) 拖拽：扫描画面找到一个可选中的物体，再拖动它
let dragAnchor = null;
for (let fy = 0.45; fy <= 0.75 && !dragAnchor; fy += 0.05) {
  for (let fx = 0.2; fx <= 0.7 && !dragAnchor; fx += 0.05) {
    await page.mouse.click(canvasBox.x + canvasBox.width * fx, canvasBox.y + canvasBox.height * fy);
    await new Promise((r) => setTimeout(r, 120));
    const selected = await page.evaluate(() => document.querySelector('.selection-hint').textContent.includes('已选中'));
    if (selected) dragAnchor = { fx, fy };
  }
}
results.push(`selected object at ${JSON.stringify(dragAnchor)}`);

if (dragAnchor) {
  const sx = canvasBox.x + canvasBox.width * dragAnchor.fx;
  const sy = canvasBox.y + canvasBox.height * dragAnchor.fy;
  const before = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shadow-theater-v1'));
    return raw.theaters.find((t) => t.id === raw.currentId).placements.map((p) => [p.kind, p.x, p.z]);
  });
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(sx + k * 16, sy + k * 9, { steps: 2 });
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 600));
  const after = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shadow-theater-v1'));
    return raw.theaters.find((t) => t.id === raw.currentId).placements.map((p) => [p.kind, Number(p.x.toFixed(2)), Number(p.z.toFixed(2))]);
  });
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  results.push(`drag changed placement: ${changed}`);
}

// 2) 台灯强度滑块
await page.evaluate(() => {
  const sliders = document.querySelectorAll('.slider-input');
  const lampIntensity = sliders[4];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(lampIntensity, '3.5');
  lampIntensity.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 700));
const lampVal = await page.evaluate(() => JSON.parse(localStorage.getItem('shadow-theater-v1')).theaters.find((t) => t.id === JSON.parse(localStorage.getItem('shadow-theater-v1')).currentId).lamp.intensity);
results.push(`lamp intensity slider -> ${lampVal}`);

// 3) 阴影贴图分辨率（触发生成器重建，验证不崩）
await page.evaluate(() => {
  const sel = document.querySelectorAll('select')[0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, '2048');
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1500));
const mapSize = await page.evaluate(() => JSON.parse(localStorage.getItem('shadow-theater-v1')).theaters.find((t) => t.id === JSON.parse(localStorage.getItem('shadow-theater-v1')).currentId).shadow.mapSize);
results.push(`mapSize rebuild -> ${mapSize}`);

// 4) 关灯触发偏暗提示
await page.evaluate(() => {
  document.querySelectorAll('.toggle')[0].click();
  document.querySelectorAll('.toggle')[1].click();
});
let darkShown = false;
for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  darkShown = await page.evaluate(() => document.querySelector('.dark-hint')?.classList.contains('show') === true);
  if (darkShown) break;
}
results.push(`dark hint after lights off: ${darkShown}`);

// 5) 复制剧场
const tabBefore = await page.$$eval('.theater-tab', (e) => e.length);
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('复制一份再改')).click());
await new Promise((r) => setTimeout(r, 1200));
const tabAfter = await page.$$eval('.theater-tab', (e) => e.length);
results.push(`theater tabs ${tabBefore} -> ${tabAfter}`);

// 6) 刷新持久化
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 3500));
const persisted = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('shadow-theater-v1'));
  const cur = raw.theaters.find((t) => t.id === raw.currentId);
  return { tabs: raw.theaters.length, mapSize: cur.shadow.mapSize, lamp: cur.lamp.intensity };
});
results.push(`after reload: ${JSON.stringify(persisted)}`);

console.log(results.join('\n'));
console.log('\nERRORS (' + errors.length + '):');
for (const e of errors.slice(0, 8)) console.log(' -', e.slice(0, 180));
await browser.close();
