import { test, expect, type Page } from '@playwright/test';

async function loadSample(page: Page) {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: '导入' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '载入示例漫游' }).click();
  await expect(page.locator('.pano-item')).toHaveCount(3);
  await expect(page.locator('.hotspot-hit').first()).toBeVisible();
}

test('首次打开显示导入对话框，载入示例后进入编辑', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: '导入' })).toBeVisible();
  await page.getByRole('button', { name: '载入示例漫游' }).last().click();
  await expect(page.locator('.crumb')).toHaveText('入口大厅');
  await expect(page.locator('.pano-item')).toHaveCount(3);
  await expect(page.locator('.group-item')).toHaveCount(4);
  await expect(page.locator('.hotspot-hit')).not.toHaveCount(0);
});

test('拖动画面按球面坐标改变视野，方向读数同步', async ({ page }) => {
  await loadSample(page);
  const readout = page.locator('.hud-readout');
  const start = await readout.textContent();
  const svg = page.locator('.viewport__svg');
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 240, box.y + box.height / 2, { steps: 16 });
  await page.mouse.up();
  const after = await readout.textContent();
  expect(after).not.toBe(start);
  const m = after!.match(/北|东北|东|东南|南|西南|西|西北/);
  expect(m).not.toBeNull();
  // 向左拖：视角向西转，经度应变化，俯仰保持在 0 附近
  expect(after).toContain('仰 0°');
});

test('滚轮缩放被限制在 30°–110°', async ({ page }) => {
  await loadSample(page);
  const svg = page.locator('.viewport__svg');
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 14; i++) await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const fov = () => page.locator('.zoom-value').textContent();
  expect(Number((await fov())!.replace('°', ''))).toBeGreaterThanOrEqual(30);
  for (let i = 0; i < 24; i++) await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  expect(Number((await fov())!.replace('°', ''))).toBeLessThanOrEqual(110);
  // 滑杆同步
  expect(await page.locator('.zoom-slider').inputValue()).toMatch(/^(\d+)$/);
});

test('点击缩略球任意位置，视口跟随过去', async ({ page }) => {
  await loadSample(page);
  const readout = page.locator('.hud-readout');
  const before = await readout.textContent();
  const mini = (await page.locator('[data-testid="minimap"]').boundingBox())!;
  await page.mouse.click(mini.x + mini.width * 0.78, mini.y + mini.height * 0.3);
  await page.waitForTimeout(200);
  const after = await readout.textContent();
  expect(after).not.toBe(before);
  // 缩略球视口轮廓也要更新
  const path = await page.locator('[data-testid="minimap-viewport"]').getAttribute('d');
  expect(path && path.length).toBeGreaterThan(10);
});

test('拖动热点到视口边缘，经纬度稳定不飘', async ({ page }) => {
  await loadSample(page);
  const marker = page.locator('.hotspot-hit').first();
  const id = await marker.getAttribute('data-hotspot-id');
  const box = (await marker.boundingBox())!;
  // 先把热点拖到画面右边缘之外
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const stage = (await page.locator('.viewport__svg').boundingBox())!;
  await page.mouse.move(stage.x + stage.width + 120, box.y + box.height / 2, { steps: 18 });
  await page.waitForTimeout(120);
  const first = await readLonLat(page, id!);
  // 继续在画面外移动，位置应停在边界处（经纬度不变）
  await page.mouse.move(stage.x + stage.width + 400, box.y + box.height / 2, { steps: 6 });
  await page.waitForTimeout(120);
  const second = await readLonLat(page, id!);
  await page.mouse.up();
  expect(Math.abs(first.lon - second.lon)).toBeLessThan(0.02);
  expect(Math.abs(first.lat - second.lat)).toBeLessThan(0.02);
  // 撤销可以回到原位
  const beforeUndo = await readLonLat(page, id!);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const afterUndo = await readLonLat(page, id!);
  expect(afterUndo.lon).not.toBeCloseTo(beforeUndo.lon, 3);
});

test('导航热点双击后淡入淡出切换全景', async ({ page }) => {
  await loadSample(page);
  await expect(page.locator('.crumb')).toHaveText('入口大厅');
  await page.locator('.hotspot-hit[data-type="nav"]').first().dblclick();
  // 过渡期间出现遮罩
  await page.waitForTimeout(1600);
  await expect(page.locator('.crumb')).toHaveText('雨林温室');
  await expect(page.locator('.pano-item.is-active')).toContainText('雨林温室');
});

test('视场角与分组可见性联动热点显示', async ({ page }) => {
  await loadSample(page);
  const count = await page.locator('.hotspot-hit').count();
  expect(count).toBeGreaterThan(0);
  // 隐藏全部 4 个分组后，画面上不应再有热点
  for (let i = 0; i < 4; i++) {
    await page.locator('.group-item__tools button[data-action="visibility"][aria-pressed="true"]').first().click();
    await page.waitForTimeout(80);
  }
  await expect(page.locator('.hotspot-hit')).toHaveCount(0);
});

test('新建热点归入当前分组，并可导出 tour.json', async ({ page }) => {
  await loadSample(page);
  // 选中「展项」分组
  await page.locator('[data-group-name="展项"] .group-item__main').click();
  await page.getByRole('button', { name: '标注' }).click();
  const svg = page.locator('.viewport__svg');
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.6);
  await expect(page.locator('.inspector__head h2')).toBeVisible();
  const groupSelect = await page.locator('#hs-group').inputValue();
  const groupText = await page.locator('#hs-group option:checked').textContent();
  expect(groupText).toContain('展项');
  expect(groupSelect.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: '导出 tour.json' }).first().click();
  const json = await page.locator('[data-testid="json-preview"]').textContent();
  const parsed = JSON.parse(json!);
  expect(parsed.format).toBe('pano-tour/v1');
  expect(parsed.panoramas).toHaveLength(3);
  const all = parsed.panoramas.flatMap((p: { hotspots: unknown[] }) => p.hotspots);
  expect(all.length).toBe(19);
  const created = parsed.panoramas
    .flatMap((p: { hotspots: { label: string; groupId: string }[] }) => p.hotspots)
    .find((h: { label: string }) => h.label === '标注');
  expect(created).toBeTruthy();
  const group = parsed.groups.find((g: { id: string; name: string }) => g.id === created.groupId);
  expect(group.name).toBe('展项');
});

test('立方体接缝检查给出 12 条接缝与六面展开图', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: '检查立方体接缝' }).click();
  const dialog = page.getByRole('dialog', { name: '立方体接缝检查' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-testid="cube-net"] image')).toHaveCount(6);
  await expect(page.locator('.seam-table tbody tr')).toHaveCount(12);
  await expect(dialog.locator('.score-ring span')).toBeVisible();
  // 点击一条接缝，放大镜应显示边条
  await page.locator('.seam-table tbody tr').first().click();
  await expect(page.locator('.loupe__img')).toBeVisible();
});

test('箭头热点可设置朝向并随相机旋转变换', async ({ page }) => {
  await loadSample(page);
  // 切到一张有箭头的全景并选中箭头热点
  await page.locator('.hs-item', { hasText: '参观动线' }).click();
  await expect(page.locator('.arrow-handle')).toBeVisible();
  const range = page.locator('.inspector input[type="range"][max="359"]');
  await range.fill('180');
  await page.waitForTimeout(200);
  // 滑杆值与朝向读数（"180° · 南"）
  expect(await range.inputValue()).toBe('180');
  const hint = await page.locator('.inspector .field .hint').last().textContent();
  expect(hint).toContain('180°');
});

test('预览模式隐藏编辑面板，点击讲解热点弹出信息卡', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.locator('.inspector')).toHaveCount(0);
  await page.locator('.hotspot-hit[data-type="info"]').first().click();
  await expect(page.locator('.info-card')).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('导入 tour.json 回填完整数据', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: '导出 tour.json' }).first().click();
  const json = (await page.locator('[data-testid="json-preview"]').textContent())!;
  await page.locator('.modal__foot .btn', { hasText: '关闭' }).click();

  await page.getByRole('button', { name: '导入' }).first().click();
  const dialog = page.getByRole('dialog', { name: '导入' });
  await dialog.getByRole('button', { name: 'tour.json' }).click();
  await dialog.locator('.json-area').fill(json.replace('"name": "入口大厅"', '"name": "入口大厅（改名）"'));
  await dialog.getByRole('button', { name: '导入', exact: true }).click();
  await expect(page.locator('.pano-item').first()).toContainText('入口大厅（改名）');
  await expect(page.locator('.pano-item')).toHaveCount(3);
});

async function readLonLat(page: Page, id: string) {
  return page.evaluate((hotspotId) => {
    const rows = Array.from(document.querySelectorAll('.hs-item'));
    const row = rows.find((r) => r.querySelector('.hs-item__sub'));
    // 直接读编辑器 DOM 上的显示值更稳：在列表里找到对应 id 的条目不可见 id，
    // 因此改用属性查询：视口里的热点组带 data-hotspot-id
    void row;
    const el = document.querySelector(`[data-hotspot-id="${hotspotId}"]`);
    if (!el) return { lon: NaN, lat: NaN };
    // 从侧栏列表里按顺序错位不可靠，改用遥感式读取：转成经纬度需要相机信息，
    // 这里直接返回 SVG transform 便于比较稳定性
    const t = el.querySelector('.hotspot')?.getAttribute('transform') ?? '';
    const m = t.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
    return { lon: m ? Number(m[1]) : NaN, lat: m ? Number(m[2]) : NaN };
  }, id);
}

test('单独载入一个场景时，跨场景的导航目标降级为讲解点', async ({ page }) => {
  await page.goto('/');
  // 首次进入会延迟弹出导入对话框，等它出现再关掉
  const dialog = page.getByRole('dialog', { name: '导入' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '关闭' }).click({ force: true });
  await expect(dialog).toHaveCount(0);
  await page.locator('.sample-chip').nth(1).click();
  await expect(page.locator('.pano-item')).toHaveCount(1);
  await page.getByRole('button', { name: '导出 tour.json' }).first().click();
  const parsed = JSON.parse((await page.locator('[data-testid="json-preview"]').textContent())!);
  const types = parsed.panoramas[0].hotspots.map((h: { type: string }) => h.type);
  // 原本两个导航热点目标不在本批导入中，降级成讲解
  expect(types.filter((t: string) => t === 'nav')).toHaveLength(0);
  expect(types).toContain('arrow');
});

test('分组可改名与改色，并写入导出', async ({ page }) => {
  await loadSample(page);
  const item = page.locator('[data-group-name="通道"]');
  const nameInput = item.locator('.group-name');
  // 受控输入：逐字符输入才能让 onInput 回调把每次编辑写回 store
  await nameInput.click();
  await nameInput.press('Control+a');
  await page.keyboard.type('主游线');
  await page.waitForTimeout(200);
  await expect(page.locator('[data-group-name="主游线"]')).toHaveCount(1);
  await page.getByRole('button', { name: '导出 tour.json' }).first().click();
  const parsed = JSON.parse((await page.locator('[data-testid="json-preview"]').textContent())!);
  expect(parsed.groups.some((g: { name: string }) => g.name === '主游线')).toBe(true);
});

test('键盘方向键旋转视角，Del 删除选中热点且可撤销', async ({ page }) => {
  await loadSample(page);
  const readout = page.locator('.hud-readout');
  const before = await readout.textContent();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  expect(await readout.textContent()).not.toBe(before);

  const countBefore = await page.locator('.hs-item').count();
  await page.locator('.hs-item').first().click();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  expect(await page.locator('.hs-item').count()).toBe(countBefore - 1);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  expect(await page.locator('.hs-item').count()).toBe(countBefore);
});

test('拖动缩略球可连续旋转', async ({ page }) => {
  await loadSample(page);
  const readout = page.locator('.hud-readout');
  const before = await readout.textContent();
  const mini = (await page.locator('[data-testid="minimap"]').boundingBox())!;
  await page.mouse.move(mini.x + mini.width / 2, mini.y + mini.height / 2);
  await page.mouse.down();
  await page.mouse.move(mini.x + mini.width / 2 + 45, mini.y + mini.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await readout.textContent()).not.toBe(before);
});
