// 抓取自定义 shader 的 GLSL 编译信息与实际 sampler 行为
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
  const t = m.text();
  if (t.includes('csm-depth') || t.includes('shader') || t.includes('Shader') || m.type() === 'error') {
    console.log(`[${m.type()}]`, t.slice(0, 300));
  }
});
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 3500));

await page.evaluate(() => {
  window.__debugDepthMode = 2;
  document.querySelector('button.btn-debug').click();
});
await new Promise((r) => setTimeout(r, 3500));

// 检查引擎能否取到 DS 纹理及其比较模式
const info = await page.evaluate(() => {
  // 通过 canvas 的 babylon 引擎没有直接暴露，改为检查 WebGL 状态：
  // 枚举所有纹理不现实，改为输出当前采样器 uniform 的类型推断
  const gl = document.querySelector('.scene-canvas').getContext('webgl2');
  if (!gl) return { gl: false };
  return {
    gl: true,
    maxTextureArrayLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
  };
});
console.log('GL INFO:', JSON.stringify(info));

await page.screenshot({ path: 'test-shots/probe.png' });
await browser.close();
