// 样条曲线与速度曲线数学模块（纯 JS，无引擎依赖，便于测试）

export function smoothstep(t) {
  t = Math.min(Math.max(t, 0), 1)
  return t * t * (3 - 2 * t)
}

export function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

export function nlerp3(a, b, t) {
  return norm3([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ])
}

/**
 * Catmull-Rom 样条，支持开放 / 闭合，带弧长参数化表。
 * positions: [[x,y,z], ...]
 */
export class Spline {
  constructor(positions, closed) {
    this.pos = positions
    this.closed = !!closed
    this.n = positions.length
    this.segCount = this.n < 2 ? 0 : (this.closed ? this.n : this.n - 1)
    this.table = []
    this.total = 0
    if (this.segCount > 0) this.build()
  }

  // 取控制点（闭合环绕 / 开放端点重复）
  p(i) {
    const n = this.n
    if (this.closed) return this.pos[((i % n) + n) % n]
    return this.pos[Math.min(Math.max(i, 0), n - 1)]
  }

  pointAt(seg, u) {
    const p0 = this.p(seg - 1), p1 = this.p(seg), p2 = this.p(seg + 1), p3 = this.p(seg + 2)
    const u2 = u * u, u3 = u2 * u
    const out = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      out[k] = 0.5 * (
        2 * p1[k]
        + (-p0[k] + p2[k]) * u
        + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2
        + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3
      )
    }
    return out
  }

  tangentAt(seg, u) {
    const p0 = this.p(seg - 1), p1 = this.p(seg), p2 = this.p(seg + 1), p3 = this.p(seg + 2)
    const u2 = u * u
    const out = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      out[k] = 0.5 * (
        (-p0[k] + p2[k])
        + 2 * (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u
        + 3 * (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u2
      )
    }
    return out
  }

  build() {
    this.table = []
    let acc = 0
    const steps = 32
    for (let s = 0; s < this.segCount; s++) {
      let prev = this.pointAt(s, 0)
      let len = 0
      for (let i = 1; i <= steps; i++) {
        const c = this.pointAt(s, i / steps)
        len += Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2])
        prev = c
      }
      this.table.push({ start: acc, len })
      acc += len
    }
    this.total = acc
  }

  // 段内 [0,u] 的近似弧长
  lengthAt(seg, u) {
    const steps = 8
    let prev = this.pointAt(seg, 0)
    let len = 0
    for (let i = 1; i <= steps; i++) {
      const c = this.pointAt(seg, (i / steps) * u)
      len += Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2])
      prev = c
    }
    return len
  }

  // 弧长 d -> { seg, u }
  locate(d) {
    if (this.segCount === 0) return { seg: 0, u: 0 }
    if (this.closed) {
      d = ((d % this.total) + this.total) % this.total
    } else {
      d = Math.min(Math.max(d, 0), this.total)
    }
    let seg = this.segCount - 1
    for (let s = 0; s < this.segCount; s++) {
      const t = this.table[s]
      if (d < t.start + t.len || s === this.segCount - 1) { seg = s; break }
    }
    const t0 = this.table[seg]
    const target = Math.min(Math.max(d - t0.start, 0), t0.len)
    // 二分求 u
    let lo = 0, hi = 1
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2
      if (this.lengthAt(seg, mid) < target) lo = mid; else hi = mid
    }
    return { seg, u: (lo + hi) / 2 }
  }

  wrapDist(d) {
    if (this.closed) return ((d % this.total) + this.total) % this.total
    return Math.min(Math.max(d, 0), this.total)
  }

  pointAtDistance(d) {
    const { seg, u } = this.locate(d)
    return this.pointAt(seg, u)
  }

  tangentAtDistance(d) {
    const { seg, u } = this.locate(d)
    return norm3(this.tangentAt(seg, u))
  }

  // 控制点 j 处的累计弧长（j == segCount 时视为终点）
  jointDistance(j) {
    if (j <= 0) return 0
    if (j >= this.segCount) return this.total
    return this.table[j].start
  }
}

// ---------------- 速度曲线 ----------------

const BASE_SPEEDS = [0.8, 1.5, 2.5, 3.5, 5.0] // 1~5 档基础速度 m/s

export function baseSpeed(gear) {
  return BASE_SPEEDS[Math.min(Math.max(Math.round(gear), 1), 5) - 1]
}

/**
 * p ∈ [0,1] 行程 -> 速度 m/s
 * 关键帧之间 smoothstep 插值，两端倍率固定为 1（起止平滑）。
 */
export function speedAt(p, cfg) {
  const base = baseSpeed(cfg.gear)
  const kfs = [{ pos: 0, mult: 1 },
    ...cfg.keyframes.slice().sort((a, b) => a.pos - b.pos),
    { pos: 1, mult: 1 }]
  let m = 1
  for (let i = 0; i < kfs.length - 1; i++) {
    if (p <= kfs[i + 1].pos || i === kfs.length - 2) {
      const span = Math.max(kfs[i + 1].pos - kfs[i].pos, 1e-6)
      const t = smoothstep((p - kfs[i].pos) / span)
      m = kfs[i].mult + (kfs[i + 1].mult - kfs[i].mult) * t
      break
    }
  }
  return base * m
}

export function estimateDuration(totalLength, cfg) {
  const N = 200
  let t = 0
  for (let i = 0; i < N; i++) {
    t += (totalLength / N) / speedAt((i + 0.5) / N, cfg)
  }
  return t
}
