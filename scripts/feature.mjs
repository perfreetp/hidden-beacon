// 验证太阳高低影响影子长短 + 剧场切换 + 旋转按钮
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.text().includes('[rotate]')) console.log(m.text()); });
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4000));

// 太阳调到很低（长影子）
await page.evaluate(() => {
  const sliders = document.querySelectorAll('.slider-input');
  const elevation = sliders[3]; // 太阳高低
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(elevation, '0.15');
  elevation.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: 'test-shots/sun-low-long-shadow.png' });

// 太阳调到很高（短影子）
await page.evaluate(() => {
  const sliders = document.querySelectorAll('.slider-input');
  const elevation = sliders[3];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(elevation, '1.35');
  elevation.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: 'test-shots/sun-high-short-shadow.png' });

// 剧场切换到夕阳长影子
await page.evaluate(() => {
  [...document.querySelectorAll('.theater-tab')].find((b) => b.textContent.includes('夕阳')).click();
});
await new Promise((r) => setTimeout(r, 2500));
const activeTheater = await page.evaluate(() => document.querySelector('.theater-tab.active')?.textContent);
await page.screenshot({ path: 'test-shots/sunset-theater.png' });
console.log('switched to:', activeTheater.trim());

// 选中一个玩具再点旋转
let clicked = false;
const box = await page.$('.scene-canvas').then((c) => c.boundingBox());
for (let fy = 0.45; fy <= 0.75 && !clicked; fy += 0.05) {
  for (let fx = 0.2; fx <= 0.7 && !clicked; fx += 0.05) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await new Promise((r) => setTimeout(r, 120));
    clicked = await page.evaluate(() => document.querySelector('.selection-hint').textContent.includes('已选中'));
  }
}
// 读取当前选中物体（由选择环位置匹配）的旋转角
const readSelectedRot = () => page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('shadow-theater-v1'));
  return raw.theaters.find((t) => t.id === raw.currentId).placements;
});
const beforeList = await readSelectedRot();
await page.evaluate(() => document.querySelectorAll('.btn-circle')[1].click()); // 右转
await new Promise((r) => setTimeout(r, 400));
const afterList = await readSelectedRot();
const changed = beforeList.some((p, i) => Math.abs(p.rotationY - afterList[i].rotationY) > 0.01);
console.log('some object rotated:', changed);
if (changed) {
  const idx = beforeList.findIndex((p, i) => Math.abs(p.rotationY - afterList[i].rotationY) > 0.01);
  console.log(`  ${beforeList[idx].kind}: ${beforeList[idx].rotationY.toFixed(3)} -> ${afterList[idx].rotationY.toFixed(3)}`);
}

console.log('ERRORS:', errors.length, errors.join('; ').slice(0, 200));
await browser.close();
