import type React from 'react';

/** 从输入事件取值（同时兼容 React SyntheticEvent 与原生 Event） */
export const inputValue = (
  e:
    | React.FormEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    | React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    | Event,
): string => {
  const target = (e.currentTarget || e.target) as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement;
  return target?.value ?? '';
};

export const inputChecked = (
  e:
    | React.FormEvent<HTMLInputElement>
    | React.ChangeEvent<HTMLInputElement>
    | Event,
): boolean => {
  const target = (e.currentTarget || e.target) as HTMLInputElement;
  return Boolean(target?.checked);
};

/** 相对时间（中文） */
export function timeAgo(ts: number, now = Date.now()): string {
  if (!ts) return '—';
  const diff = now - ts;
  if (diff < 15_000) return '刚刚';
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

/** 邮箱打码：ab****@example.com */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '****';
  const head = email.slice(0, Math.min(2, at));
  return `${head}****${email.slice(at)}`;
}

/** 触发文本文件下载 */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 将十六进制 HEX 颜色转换为指定透明度的 RGBA 字符串 */
export function hexToRgba(hex: string | undefined, alpha = 1): string {
  if (!hex || typeof hex !== 'string') return `rgba(59, 130, 246, ${alpha})`;
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (clean.length !== 6) return `rgba(59, 130, 246, ${alpha})`;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return `rgba(59, 130, 246, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
