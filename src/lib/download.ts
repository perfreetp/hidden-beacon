/** 浏览器下载小工具 */

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  triggerDownload(URL.createObjectURL(blob), filename);
}

export function downloadDataUrl(filename: string, dataUrl: string) {
  triggerDownload(dataUrl, filename);
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // blob: 链接延迟回收，data: 链接 revoke 也无害
  setTimeout(() => {
    if (href.startsWith('blob:')) URL.revokeObjectURL(href);
  }, 4000);
}

export function timestampName(prefix: string, ext: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}
