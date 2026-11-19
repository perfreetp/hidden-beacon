/** 图片加载与尺寸探测 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`无法加载图片：${src}`));
    img.src = src;
  });
}

export function makeObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}
