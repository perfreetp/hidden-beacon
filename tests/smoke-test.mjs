/**
 * 无头浏览器冒烟测试：
 * 1. 页面加载无控制台错误
 * 2. WebGL2 上下文创建成功
 * 3. 模拟在画布上画几笔 → 出现图层、localStorage 有存档
 * 4. 切换所有效果、重排顺序、拖分屏滑块、高对比模式
 * 5. 导出 PNG / JSON 不抛错
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5199/';

const errors = [];
const logs = [];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    '--headless=new',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--enable-unsafe-swiftshader'
  ]
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1.5
});

page.on('console', (msg) => {
  logs.push(`[${msg.type()}] ${msg.text()}`);
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// 1. WebGL2 上下文
const glInfo = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c?.getContext('webgl2');
  return {
    hasCanvas: !!c,
    hasWebGL2: !!gl,
    renderer: gl?.getParameter(gl.RENDERER),
    float: !!gl?.getExtension('EXT_color_buffer_float')
  };
});
console.log('GL:', JSON.stringify(glInfo));

// 2. 在画布中央画几笔（真实指针事件）
const box = await page.locator('canvas').boundingBox();
function cx(t) { return box.x + box.width * t; }
function cy(t) { return box.y + box.height * t; }
await page.mouse.move(cx(0.3), cy(0.4));
await page.mouse.down();
for (let i = 0; i <= 10; i++) {
  await page.mouse.move(cx(0.3 + i * 0.04), cy(0.4 + Math.sin(i) * 0.05));
}
await page.mouse.up();

// 换形状再画
await page.getByRole('button', { name: /小鱼/ }).click();
await page.mouse.move(cx(0.55), cy(0.6));
await page.mouse.down();
await page.mouse.move(cx(0.65), cy(0.55));
await page.mouse.up();

await page.getByRole('button', { name: /房子/ }).click();
await page.mouse.click(cx(0.4), cy(0.7));

await page.waitForTimeout(500);
const afterDraw = await page.evaluate(() => {
  const raw = localStorage.getItem('magic-light-board:v1');
  const state = raw ? JSON.parse(raw) : null;
  return {
    layerCount: state?.layers?.length ?? 0,
    dabCount: state?.layers?.reduce((n, l) => n + l.dabs.length, 0) ?? 0,
    saved: !!raw
  };
});
console.log('after draw:', JSON.stringify(afterDraw));

// 3. 展开各效果卡并调参（手风琴：同时只能开一张）
async function openCard(name) {
  await page.locator('.effect-card', { hasText: name }).locator('.head-btn').first().click();
}
await openCard('泛光');
// 泛光强度、半径各拖一下
const bloomSliders = page.locator('.effect-card', { hasText: '泛光' }).locator('input[type=range]');
await bloomSliders.nth(0).fill('1.5');
await bloomSliders.nth(1).fill('8');

await openCard('景深');
// 打开景深开关并调模糊
const switches = page.locator('.switch input');
await switches.nth(1).evaluate((el) => el.click());
const dofSliders = page.locator('.effect-card', { hasText: '景深' }).locator('input[type=range]');
await dofSliders.nth(1).fill('5');

await openCard('色调映射');
// 色调映射三档（按钮里同时有模式名和提示，用文本片段定位）
for (const mode of ['鲜艳', '夜色', '柔和']) {
  await page.locator('.mode-btn', { hasText: mode }).first().click();
}

await openCard('描边');
await switches.nth(3).evaluate((el) => el.click()); // 描边开关
const outlineSlider = page.locator('.effect-card', { hasText: '描边' }).locator('input[type=range]');
await outlineSlider.first().fill('3.5');
await page.waitForTimeout(300);
// 高对比
await page.getByText(/高对比模式/).click();
await page.waitForTimeout(400);

// 4. 效果重排：把第一张卡拖到第三张的位置
const cards = page.locator('.effect-card');
const first = await cards.nth(0).boundingBox();
const third = await cards.nth(2).boundingBox();
await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
await page.mouse.down();
await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);

// 5. 分屏滑块
await page.getByRole('button', { name: '左右对比' }).click();
await page.getByRole('button', { name: '只看原图' }).click();
await page.getByRole('button', { name: '全看效果' }).click();

// 6. 缩放/平移
await page.mouse.move(cx(0.5), cy(0.5));
await page.mouse.wheel(0, -400);
await page.keyboard.down('Shift');
await page.mouse.down();
await page.mouse.move(cx(0.55), cy(0.55), { steps: 5 });
await page.mouse.up();
await page.keyboard.up('Shift');
await page.waitForTimeout(300);

// 7. 导出（拦截下载）
const downloads = [];
page.on('download', (d) => downloads.push(d.suggestedFilename()));
await page.getByRole('button', { name: /导出高清图/ }).click();
await page.getByRole('button', { name: /导出效果配置/ }).click();
await page.waitForTimeout(800);

// 8. 刷新页面 → 状态还原
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const restored = await page.evaluate(() => {
  const state = JSON.parse(localStorage.getItem('magic-light-board:v1'));
  return {
    layers: state.layers.length,
    order: state.effectOrder.join(','),
    highContrast: state.highContrast,
    dofOn: state.dof.enabled,
    outlineOn: state.outline.enabled,
    tonemapMode: state.tonemap.mode
  };
});
console.log('restored:', JSON.stringify(restored));

// 9. 读显示缓冲，确认不是全黑（有东西画出来）
const pixels = await page.evaluate(() => {
  const hook = window.__magicBoard;
  return hook ? hook.readDisplayStats() : null;
});
console.log('pixels:', JSON.stringify(pixels));

// 10. 撤销
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);

const verdict = {
  errors,
  downloads,
  checks: {
    webgl2: glInfo.hasWebGL2,
    floatFBO: glInfo.float,
    drewDabs: afterDraw.dabCount >= 5,
    persisted: afterDraw.saved,
    restored: restored.layers >= 1 && restored.highContrast === true,
    canvasLit: pixels.lit > 100,
    downloadedBoth: downloads.length === 2
  }
};
console.log('\n==== SMOKE RESULT ====');
console.log(JSON.stringify(verdict, null, 2));
const ok =
  errors.length === 0 &&
  Object.values(verdict.checks).every(Boolean);
console.log(ok ? '\n✅ ALL CHECKS PASSED' : '\n❌ CHECKS FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
