import { chromium } from 'playwright-core';
import fs from 'node:fs';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--headless=new', '--ignore-gpu-blocklist', '--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// 画几笔
const box = await page.locator('canvas').boundingBox();
await page.mouse.move(box.x + 400, box.y + 300);
await page.mouse.down();
await page.mouse.move(box.x + 600, box.y + 400, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(500);

// 1. 高清 PNG：直接拿 dataURL 解码尺寸
const pngInfo = await page.evaluate(async () => {
  const dataUrl = window.__magicBoard.exportPng();
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  // 验证 dataURL 头与非空
  return {
    isPng: dataUrl.startsWith('data:image/png;base64,'),
    width: img.width,
    height: img.height,
    base64Length: dataUrl.length
  };
});
console.log('PNG:', JSON.stringify(pngInfo));

// 2. 实际下载两个文件
const downloads = [];
page.on('download', async (d) => {
  const path = await d.path();
  const buf = fs.readFileSync(path);
  downloads.push({ name: d.suggestedFilename(), bytes: buf.length, magic: buf.subarray(0, 4).toString('hex') });
});
await page.getByRole('button', { name: /导出高清图/ }).click();
await page.getByRole('button', { name: /导出效果配置/ }).click();
await page.waitForTimeout(1000);

// 3. JSON 配置结构
const config = JSON.parse(
  await page.evaluate(() => localStorage.getItem('magic-light-board:v1'))
);
const configShape = {
  hasLayers: Array.isArray(config.layers) && config.layers.length >= 1,
  hasEffectOrder: Array.isArray(config.effectOrder) && config.effectOrder.length === 4,
  hasBloom: !!config.bloom && typeof config.bloom.intensity === 'number',
  hasDof: !!config.dof && typeof config.dof.focusX === 'number',
  hasTonemap: !!config.tonemap && ['soft', 'vivid', 'night'].includes(config.tonemap.mode),
  hasOutline: !!config.outline && typeof config.outline.thickness === 'number',
  hasView: !!config.view && typeof config.view.zoom === 'number'
};
console.log('下载:', JSON.stringify(downloads));
console.log('配置结构:', JSON.stringify(configShape, null, 2));

const backing = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return [c.width, c.height];
});
const is2x = pngInfo.width === backing[0] * 2 && pngInfo.height === backing[1] * 2;
console.log(`高清尺寸: PNG ${pngInfo.width}x${pngInfo.height} vs 后备 ${backing[0]}x${backing[1]} → 2x=${is2x}`);

const ok =
  pngInfo.isPng &&
  is2x &&
  pngInfo.base64Length > 10000 &&
  downloads.length === 2 &&
  downloads.some((d) => d.name.endsWith('.png') && d.magic === '89504e47') &&
  downloads.some((d) => d.name.endsWith('.json')) &&
  Object.values(configShape).every(Boolean);
console.log(ok ? '\n✅ EXPORT CHECKS PASSED' : '\n❌ EXPORT CHECKS FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
