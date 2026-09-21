import type { ProtectedSite } from './types';

/**
 * 规范化用户输入的域名或泛域名：
 * - 支持普通域名（如 example.com）与泛域名（如 *.example.com 或 .example.com）
 * - 去协议/路径/端口，转小写，泛域名统一规整为 *.domain.tld 格式
 * - 非法输入返回 null
 */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;

  // 1. 若带协议，先剥离协议（如 https://, http://）
  s = s.replace(/^[a-z]+:\/\//, '');

  // 2. 去除路径、查询参数、哈希和端口
  const slashIdx = s.indexOf('/');
  if (slashIdx >= 0) s = s.slice(0, slashIdx);
  const qIdx = s.indexOf('?');
  if (qIdx >= 0) s = s.slice(0, qIdx);
  const hIdx = s.indexOf('#');
  if (hIdx >= 0) s = s.slice(0, hIdx);
  const portIdx = s.indexOf(':');
  if (portIdx >= 0) s = s.slice(0, portIdx);

  // 3. 判定是否为通配泛域名
  const isWildcard = s.startsWith('*.') || s.startsWith('.');
  s = s.replace(/^\*\./, '').replace(/^\./, '');

  // 4. 清除尾随点与 www 前缀
  s = s.replace(/\.$/, '');
  if (!isWildcard) {
    s = s.replace(/^www\./, '');
  }

  // 5. 要求形如 xxx.tld（不接受纯 IP / 单标签主机名）
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(s)) return null;

  return isWildcard ? `*.${s}` : s;
}

/**
 * 判定主机名 host 是否匹配目标域名或泛域名 pattern：
 * - pattern 如 *.google.com：匹配 google.com 以及任何子域名（www.google.com, sub.mail.google.com 等）
 * - pattern 如 google.com：自动覆盖其主域和子域名
 * - pattern 如 *.api.google.com：精确匹配 api.google.com 与 v1.api.google.com，不会误伤 mail.google.com
 */
export function domainMatchesPattern(host: string, pattern: string): boolean {
  if (!host || !pattern) return false;
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  const p = pattern.trim().toLowerCase().replace(/^\*\./, '').replace(/^\./, '').replace(/\.$/, '');
  if (!h || !p) return false;
  return h === p || h.endsWith(`.${p}`);
}

/** URL 是否属于某域名或泛域名规则，供 UI、拦截与测试统一使用 */
export function urlMatchesDomain(rawUrl: string, pattern: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, '');
    return domainMatchesPattern(host, pattern);
  } catch {
    return false;
  }
}

/* ---------- IPv4 / CIDR ---------- */

export function ipToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = ((out << 8) | n) >>> 0;
  }
  return out;
}

export function parseCidr(cidr: string): { net: number; bits: number } | null {
  const m = cidr.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/);
  if (!m) return null;
  const net = ipToInt(m[1]);
  if (net === null) return null;
  const bits = m[2] === undefined ? 32 : Number(m[2]);
  if (bits < 0 || bits > 32) return null;
  return { net, bits };
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr);
  const ipInt = ipToInt(ip);
  if (!parsed || ipInt === null) return false;
  const mask = parsed.bits === 0 ? 0 : (~0 << (32 - parsed.bits)) >>> 0;
  return (ipInt & mask) === (parsed.net & mask);
}

/* ---------- 守护规则匹配 ---------- */

export interface SiteEvaluation {
  pass: boolean;
  countryMatch: boolean;
  ipMatch: boolean;
  hasCountryConfig: boolean;
  hasIpConfig: boolean;
}

/**
 * 获取站点校验的多维度详细匹配结果
 */
export function evaluateSiteDetails(
  site: Pick<ProtectedSite, 'expectedCountries' | 'expectedIpRanges' | 'matchMode'>,
  exitIp: string,
  countryCode: string,
): SiteEvaluation {
  const hasCountryConfig = site.expectedCountries.length > 0;
  const hasIpConfig = site.expectedIpRanges.length > 0;
  const countryMatch = hasCountryConfig
    ? site.expectedCountries.includes(countryCode.toUpperCase())
    : true;
  const ipMatch = hasIpConfig
    ? site.expectedIpRanges.some((r) => ipInCidr(exitIp, r))
    : true;

  let pass = false;
  if (!hasCountryConfig && !hasIpConfig) {
    pass = false;
  } else if (site.matchMode === 'all') {
    pass = countryMatch && ipMatch;
  } else {
    // matchMode === 'any'
    if (hasCountryConfig && hasIpConfig) {
      pass = countryMatch || ipMatch;
    } else if (hasCountryConfig) {
      pass = countryMatch;
    } else {
      pass = ipMatch;
    }
  }

  return { pass, countryMatch, ipMatch, hasCountryConfig, hasIpConfig };
}

/**
 * 判定当前落地是否符合守护规则：
 * 每个已配置的维度（国家 / IP 段）单独判定；
 * matchMode=any：任一维度通过即放行；all：全部已配置维度都需通过。
 * 未配置任何维度时视为不通过（fail-closed）。
 */
export function evaluateSite(
  site: Pick<ProtectedSite, 'expectedCountries' | 'expectedIpRanges' | 'matchMode'>,
  exitIp: string,
  countryCode: string,
): boolean {
  return evaluateSiteDetails(site, exitIp, countryCode).pass;
}

/* ---------- eTLD+1 近似提取（习惯统计用） ---------- */

const SECOND_LEVEL_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'com.hk', 'org.hk', 'edu.hk', 'gov.hk',
  'com.tw', 'org.tw', 'edu.tw',
  'co.kr', 'or.kr', 'ac.kr', 'go.kr',
  'com.sg', 'edu.sg', 'gov.sg',
  'com.my', 'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'net.nz',
  'com.br', 'net.br', 'org.br',
  'com.mx', 'com.ar', 'com.tr', 'com.ru',
  'co.in', 'net.in', 'org.in',
  'co.za', 'co.th', 'in.th', 'com.vn', 'com.ph',
]);

/** 近似提取可注册域名（eTLD+1），如 chat.openai.com -> openai.com */
export function getRegistrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  const labels = h.split('.');
  if (labels.length <= 2) return h;
  const lastTwo = labels.slice(-2).join('.');
  if (SECOND_LEVEL_TLDS.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/** 时间戳是否仍在有效期内 */
export function isFresh(ts: number, maxAgeMs: number, now = Date.now()): boolean {
  return now - ts < maxAgeMs;
}
