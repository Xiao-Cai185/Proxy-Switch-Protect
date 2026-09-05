/**
 * 国旗展示：Windows 上旗帜 Emoji 常显示为两字母，故 UI 统一用 SVG。
 * 使用 flagcdn 公开 CDN（扩展页允许 https 图片）。
 */

/** 国家代码 -> Emoji 旗帜（区域指示符）。仅作测试兜底，UI 请用 SVG。 */
export function flagEmoji(cc: string): string {
  const code = cc.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '\u{1F3F3}\u{FE0F}';
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + (code.charCodeAt(0) - 65),
    base + (code.charCodeAt(1) - 65),
  );
}

/** 矢量 SVG 国旗 URL（首选） */
export function flagSvgUrl(cc: string): string | null {
  const code = cc.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return null;
  return `https://flagcdn.com/${code}.svg`;
}

/** PNG 回退（部分环境 SVG 加载失败时） */
export function flagPngUrl(cc: string, width = 40): string | null {
  const code = cc.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return null;
  return `https://flagcdn.com/w${width}/${code}.png`;
}
