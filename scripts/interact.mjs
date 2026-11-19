// 交互测试:拾取、框选、显示模式切换、拉远触发 LOD1
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = process.env.TEMP;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4519/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 6000));

const app = () => page.evaluate(() => {
  const a = document.querySelector('terrain-app');
  return {
    hud: a.shadowRoot.querySelector('terrain-hud').shadowRoot.querySelector('.panel').textContent,
    pick: a.shadowRoot.querySelector('terrain-inspector').shadowRoot.querySelector('#pick').textContent,
    box: a.shadowRoot.querySelector('terrain-inspector').shadowRoot.querySelector('#box').textContent,
  };
});

// 1. 点击坡面拾取(点画面下方 1/3 处,必中地形)
await page.mouse.click(700, 600);
await new Promise((r) => setTimeout(r, 500));
let s = await app();
console.log('PICK:', s.pick || '(none)');

// 2. Shift+拖拽框选
await page.keyboard.down('Shift');
await page.mouse.move(500, 400);
await page.mouse.down();
await page.mouse.move(900, 650, { steps: 10 });
await page.mouse.up();
await page.keyboard.up('Shift');
await new Promise((r) => setTimeout(r, 500));
s = await app();
console.log('BOX:', s.box || '(none)');
await page.screenshot({ path: OUT + '\\t1-pick-box.png' });

// 3. 等高线 + 法线着色 + 线框
const clickBtn = (cmd) => page.evaluate((c) => {
  document.querySelector('terrain-app').shadowRoot
    .querySelector('terrain-toolbar').shadowRoot
    .querySelector(`button[data-cmd="${c}"]`).click();
}, cmd);
await clickBtn('contours');
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: OUT + '\\t2-contours.png' });
await clickBtn('contours');
await clickBtn('normals');
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: OUT + '\\t3-normals.png' });
await clickBtn('normals');
await clickBtn('wireframe');
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: OUT + '\\t4-wireframe.png' });
await clickBtn('wireframe');

// 4. 滚轮拉远 -> 应切到 LOD1,遮挡剔除数字应出现
for (let i = 0; i < 14; i++) { await page.mouse.wheel({ deltaY: 400 }); await new Promise((r) => setTimeout(r, 120)); }
await new Promise((r) => setTimeout(r, 2500));
s = await app();
console.log('ZOOMED-OUT HUD:', s.hud);
await page.screenshot({ path: OUT + '\\t5-zoomed.png' });

console.log('PAGEERRORS:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
