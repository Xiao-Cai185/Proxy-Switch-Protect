import type { CheckerConfig } from './types';

/** 按点分路径从 JSON 中取值，如 extractPath(obj, 'connection.isp') */
export function extractPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** 规范化国家代码：必须为两位字母 */
export function normalizeCountry(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/** 粗校验 IP 字符串（v4 / v6） */
export function normalizeIp(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s)) return s;
  if (/^[0-9a-fA-F:]{2,45}$/.test(s) && s.includes(':')) return s;
  return null;
}

export interface CheckerOutput {
  ip: string;
  countryCode: string;
  city?: string;
  isp?: string;
  source: string;
}

/** 请求单个检测源（在后台 Service Worker 中执行，自动走当前浏览器代理） */
export async function runChecker(
  cfg: CheckerConfig,
  timeoutMs: number,
): Promise<CheckerOutput> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(cfg.url, {
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data: unknown = await resp.json();
    const ip = normalizeIp(extractPath(data, cfg.ipPath));
    const countryCode = normalizeCountry(extractPath(data, cfg.countryPath));
    if (!ip || !countryCode) throw new Error('响应中缺少 IP 或国家代码');
    const cityRaw = cfg.cityPath ? extractPath(data, cfg.cityPath) : undefined;
    const ispRaw = cfg.ispPath ? extractPath(data, cfg.ispPath) : undefined;
    return {
      ip,
      countryCode,
      city: typeof cityRaw === 'string' && cityRaw ? cityRaw : undefined,
      isp: typeof ispRaw === 'string' && ispRaw ? ispRaw : undefined,
      source: cfg.name,
    };
  } finally {
    clearTimeout(timer);
  }
}
