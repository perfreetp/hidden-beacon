// 标注摆放:按优先级排序,逐个做包围盒碰撞检测;
// 放不下的尝试降级为小圆点,圆点也放不下则隐藏。

function intersects(a, b) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
}

/**
 * @param cands 候选标注 [{ id, name, x, y, layer, priority, size, color, allowDot, length }]
 * @returns {{ texts: Array, dots: Array }}
 */
export function placeLabels(cands, w, h) {
  const texts = []
  const dots = []
  const boxes = []

  const sorted = [...cands].sort(
    (a, b) => a.priority - b.priority || (b.length || 0) - (a.length || 0)
  )

  for (const c of sorted) {
    // 视口外(留少量边距)直接跳过
    if (c.x < -80 || c.x > w + 80 || c.y < -40 || c.y > h + 40) continue

    const fs = c.size
    // 中文按 ~0.95em 估宽,留 padding
    const tw = c.name.length * fs * 0.95 + 8
    const th = fs + 6
    const box = [c.x - tw / 2, c.y - th / 2, c.x + tw / 2, c.y + th / 2]

    if (!boxes.some((b) => intersects(box, b))) {
      boxes.push(box)
      texts.push(c)
      continue
    }

    // 降级为小圆点
    if (c.allowDot) {
      const r = 5
      const db = [c.x - r, c.y - r, c.x + r, c.y + r]
      if (!boxes.some((b) => intersects(db, b))) {
        boxes.push(db)
        dots.push(c)
      }
      // 圆点也冲突 -> 隐藏
    }
  }

  return { texts, dots }
}
