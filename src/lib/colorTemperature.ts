// 开尔文色温 -> RGB 近似转换（Tanner Helland 算法的简化版）
// 输入范围约 1000K ~ 40000K，输出 0~1 的线性-ish RGB

function clamp(v: number, lo = 0, hi = 255): number {
  return Math.min(hi, Math.max(lo, v));
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function kelvinToRgb(kelvin: number): Rgb {
  const t = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }

  return {
    r: clamp(r) / 255,
    g: clamp(g) / 255,
    b: clamp(b) / 255,
  };
}

/** 给 UI 色条用的 css 颜色 */
export function kelvinToCss(kelvin: number): string {
  const { r, g, b } = kelvinToRgb(kelvin);
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/** 色温的中文感受标签 */
export function temperatureLabel(kelvin: number): string {
  if (kelvin < 2600) return '暖黄 · 烛光';
  if (kelvin < 3800) return '柔和 · 夕阳';
  if (kelvin < 5500) return '中性 · 晨光';
  if (kelvin < 7500) return '明亮 · 正午';
  return '清冷 · 阴天';
}
