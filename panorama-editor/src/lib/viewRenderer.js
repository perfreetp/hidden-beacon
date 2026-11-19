// 透视画面渲染: 等距柱状源图 -> 矩形透视投影
// 每个屏幕像素走精确反投影取源图像素; 相机空间射线 LUT 随 fov/尺寸缓存。
import { cameraBasis, clamp, D2R } from './geo.js'

export class ViewRenderer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })
    this.rayLut = null       // 单位射线 (相机空间), 长度 = w*h*3
    this.lutKey = ''
    this.srcImage = null
    this.srcData = null
    this.w = 0; this.h = 0
    this.quality = 0.65      // 交互时的渲染比例
  }

  setSource(img) {
    this.srcImage = img
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    const cx = c.getContext('2d', { willReadFrequently: true })
    cx.drawImage(img, 0, 0)
    this.srcData = cx.getImageData(0, 0, c.width, c.height)
  }

  buildLut(w, h, fov) {
    const key = `${w}x${h}@${fov.toFixed(2)}`
    if (key === this.lutKey && this.rayLut) return
    this.lutKey = key
    const half = Math.tan(fov * 0.5 * D2R)
    const lut = new Float32Array(w * h * 3)
    let k = 0
    for (let y = 0; y < h; y++) {
      const ny = (1 - (2 * (y + 0.5)) / h) // 屏幕上为正
      for (let x = 0; x < w; x++) {
        const nx = (2 * (x + 0.5)) / w - 1
        // 相机空间: f=+z, r=+x, u=+y
        let rx = nx * half, ry = ny * half, rz = 1
        const len = Math.hypot(rx, ry, rz)
        lut[k++] = rx / len; lut[k++] = ry / len; lut[k++] = rz / len
      }
    }
    this.rayLut = lut
  }

  /** displayW/displayH: CSS 像素; full=false 时按 quality 降采样 */
  render(yaw, pitch, fov, displayW, displayH, full = true) {
    if (!this.srcData) return
    const scale = full ? 1 : this.quality
    const w = Math.max(64, Math.round(displayW * scale))
    const h = Math.max(48, Math.round(displayH * scale))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
    this.w = w; this.h = h
    this.buildLut(w, h, fov)

    const { f, r, u } = cameraBasis(yaw, pitch)
    const sd = this.srcData.data, sw = this.srcData.width, sh = this.srcData.height
    const out = this.ctx.createImageData(w, h)
    const od = out.data
    const lut = this.rayLut
    let li = 0, oi = 0
    for (let i = 0; i < w * h; i++, li += 3, oi += 4) {
      // 相机空间 -> 世界方向 (单位向量旋转后仍为单位向量)
      const rx = lut[li], ry = lut[li + 1], rz = lut[li + 2]
      const dx = r[0] * rx + u[0] * ry + f[0] * rz
      const dy = r[1] * rx + u[1] * ry + f[1] * rz
      const dz = r[2] * rx + u[2] * ry + f[2] * rz
      // 直接等距柱状映射 (单位向量, 无需再归一化)
      let lon = Math.atan2(dx, dz) * 180 / Math.PI
      const lat = Math.asin(clamp(dy, -1, 1)) * 180 / Math.PI
      let ex = (lon + 180) / 360 * sw
      const ey = (90 - lat) / 180 * sh
      // 双线性, 水平方向环绕
      const x0 = Math.floor(ex) % sw
      const x1 = (x0 + 1) % sw
      const tx = ex - Math.floor(ex)
      let y0 = Math.floor(ey), y1 = y0 + 1
      y0 = clamp(y0, 0, sh - 1); y1 = clamp(y1, 0, sh - 1)
      const ty = ey - Math.floor(ey)
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c] * (1 - tx) + sd[i10 + c] * tx
        const bot = sd[i01 + c] * (1 - tx) + sd[i11 + c] * tx
        od[oi + c] = top * (1 - ty) + bot * ty
      }
      od[oi + 3] = 255
    }
    this.ctx.putImageData(out, 0, 0)
  }
}
