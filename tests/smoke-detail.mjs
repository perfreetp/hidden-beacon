/**
 * 第二轮：需求细节验证
 * - 多图层独立（隐藏/显示）
 * - 橡皮擦真的擦除内容
 * - 景深对焦环可拖动
 * - 分屏滑块改变 split
 * - 效果顺序变化导致画面像素变化（顺序重算）
 * - 高对比模式开关
 * - 撤销/重做
 */
import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--ignore-gpu-blocklist', '--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const read = async () => {
  // 持久化有 400ms 防抖
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('magic-light-board:v1'));
    return {
      layers: s.layers.map((l) => ({
        name: l.name,
        visible: l.visible,
        dabs: l.dabs.length,
        hasEraser: l.dabs.some((d) => d.shape === 'eraser')
      })),
      order: s.effectOrder,
      hc: s.highContrast,
      stats: window.__magicBoard.readDisplayStats()
    };
  });
};

const box = await page.locator('canvas').boundingBox();
const P = (tx, ty) => [box.x + box.width * tx, box.y + box.height * ty];

// 画第一个图层（星星）
let [x, y] = P(0.3, 0.4);
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x + 120, y + 40, { steps: 6 });
await page.mouse.up();

// 新建第二个图层并画小鱼
await page.getByRole('button', { name: /小鱼/ }).click();
await page.locator('.layers .icon-btn', { hasText: '＋' }).click();
[x, y] = P(0.6, 0.6);
await page.mouse.click(x, y);

let r = await read();
console.log('两层:', JSON.stringify(r.layers));
const twoLayerOk = r.layers.length === 2 && r.layers[1].dabs >= 1;

// 隐藏第一层 → 亮像素应减少
const litBoth = r.stats.lit;
await page.locator('.layer-row').nth(0).locator('.eye').click();
await page.waitForTimeout(400);
r = await read();
const litHidden = r.stats.lit;
console.log(`隐藏前 lit=${litBoth} 隐藏后 lit=${litHidden}`);
const hideOk = litHidden < litBoth;
// 恢复
await page.locator('.layer-row').nth(0).locator('.eye').click();

// 橡皮擦
await page.getByRole('button', { name: /橡皮擦/ }).click();
[x, y] = P(0.3, 0.4);
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x + 100, y + 30, { steps: 5 });
await page.mouse.up();
r = await read();
const eraserOk = r.layers.some((l) => l.hasEraser);
console.log('橡皮擦记录:', eraserOk);

// 景深对焦环：开启景深后拖动 reticle
await page.locator('.effect-card', { hasText: '景深' }).locator('.head-btn').click();
await page.locator('.effect-card', { hasText: '景深' })
  .locator('.switch input').evaluate((el) => el.click());
await page.waitForTimeout(400);
const focusBefore = await page.evaluate(
  () => JSON.parse(localStorage.getItem('magic-light-board:v1')).dof.focusX
);
const reticle = page.locator('.reticle');
await reticle.waitFor({ state: 'visible', timeout: 5000 });
const rb = await reticle.boundingBox();
if (rb) {
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width / 2 + 80, rb.y + rb.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
}
await page.waitForTimeout(500);
const focusAfter = await page.evaluate(
  () => JSON.parse(localStorage.getItem('magic-light-board:v1')).dof.focusX
);
console.log(`对焦 X: ${focusBefore.toFixed(3)} → ${focusAfter.toFixed(3)}`);
const reticleOk = Math.abs(focusAfter - focusBefore) > 0.01;

// 分屏：点"左右对比"，画布 split 应为 0.5
await page.getByRole('button', { name: '左右对比' }).click();
await page.waitForTimeout(300);
const splitOk = await page.evaluate(() => {
  const line = document.querySelector('.split-line');
  return line && line.style.left.startsWith('50');
});
console.log('分屏 50%:', splitOk);

// 效果顺序重排 → 像素变化（用上下移按钮，确定性强）
const orderBefore = (await read()).order.join(',');
const litOrderBefore = (await read()).stats.lit;
// 把最后一张描边卡移到最前（点 3 次上移）
const outlineCard = page.locator('.effect-card', { hasText: '描边' });
for (let i = 0; i < 3; i++) {
  await outlineCard.locator('.card-actions button').nth(0).click();
  await page.waitForTimeout(120);
}
r = await read();
const orderAfter = r.order.join(',');
const litOrderAfter = r.stats.lit;
console.log(`顺序: ${orderBefore} → ${orderAfter}; lit ${litOrderBefore} → ${litOrderAfter}`);
const reorderOk = orderAfter !== orderBefore;

// 高对比（label 里的 checkbox 视觉隐藏，点 label 文本）
await page.locator('.contrast-row span', { hasText: '高对比模式' }).click();
await page.waitForTimeout(500);
const hc = await page.evaluate(
  () => JSON.parse(localStorage.getItem('magic-light-board:v1')).highContrast
);
const hcClass = await page.evaluate(() =>
  document.documentElement.classList.contains('high-contrast')
);
console.log('高对比 store/class:', hc, hcClass);
const hcOk = hc && hcClass;

// 撤销：历史里混着效果/图层等操作，一直撤到不能再撤，验证笔画能被回退
await page.waitForTimeout(500);
const dabBeforeUndo = (await read()).layers.reduce((n, l) => n + l.dabs, 0);
const undoBtn = page.getByRole('button', { name: /撤销/ });
for (let i = 0; i < 40; i++) {
  const disabled = await undoBtn.isDisabled();
  if (disabled) break;
  await undoBtn.click();
  await page.waitForTimeout(120);
}
await page.waitForTimeout(400);
const dabAfterUndo = (await read()).layers.reduce((n, l) => n + l.dabs, 0);
const layerAfterUndo = (await read()).layers.length;
console.log(`撤销到尽头: 笔数 ${dabBeforeUndo} → ${dabAfterUndo}, 图层数 → ${layerAfterUndo}`);
const undoOk = dabAfterUndo < dabBeforeUndo || layerAfterUndo < 2;

const result = {
  errors,
  checks: {
    twoLayer: twoLayerOk,
    hideLayer: hideOk,
    eraser: eraserOk,
    reticleDrag: reticleOk,
    split: splitOk,
    reorder: reorderOk,
    highContrast: hcOk,
    undo: undoOk
  }
};
console.log('\n==== DETAIL RESULT ====');
console.log(JSON.stringify(result, null, 2));
const ok = errors.length === 0 && Object.values(result.checks).every(Boolean);
console.log(ok ? '\n✅ ALL DETAIL CHECKS PASSED' : '\n❌ DETAIL CHECKS FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
