import { ref } from 'vue'

// 每次有瓦片加载完成/失败时自增,驱动渲染层重算
export const cacheVersion = ref(0)

// key: "z/x/y" -> { status: 'loading' | 'loaded' | 'empty' | 'error', data }
const cache = new Map()
const MAX_ENTRIES = 400

export function getTile(z, x, y) {
  const key = `${z}/${x}/${y}`
  let e = cache.get(key)
  if (e) return e

  e = { status: 'loading', data: null }
  cache.set(key, e)

  // 简单 LRU:超限时淘汰最老的非加载中条目
  if (cache.size > MAX_ENTRIES) {
    for (const [k, v] of cache) {
      if (v.status !== 'loading') {
        cache.delete(k)
        if (cache.size <= MAX_ENTRIES * 0.8) break
      }
    }
  }

  fetch(`${import.meta.env.BASE_URL}tiles/${z}/${x}/${y}.json`)
    .then((r) => {
      // 不存在 / 被 SPA 回退成 HTML 的响应都按空瓦片处理
      if (r.status === 404 || !(r.headers.get('content-type') || '').includes('json')) {
        e.status = 'empty'
        return
      }
      if (!r.ok) {
        e.status = 'error'
        return
      }
      return r.json().then((d) => {
        e.data = d
        e.status = 'loaded'
      })
    })
    .catch(() => {
      e.status = 'error'
    })
    .finally(() => {
      cacheVersion.value++
    })

  return e
}

// 从 (zt,tx,ty) 向上找最近的已加载祖先瓦片(父级占位)
export function findLoadedAncestor(zt, tx, ty, minZ) {
  let zl = zt - 1
  let ax = tx >> 1
  let ay = ty >> 1
  while (zl >= minZ) {
    const e = getTile(zl, ax, ay)
    if (e.status === 'loaded') return { zl, tx: ax, ty: ay, data: e.data }
    if (e.status === 'empty') return null // 祖先为空,再往上也不会有意义
    zl--
    ax >>= 1
    ay >>= 1
  }
  return null
}
