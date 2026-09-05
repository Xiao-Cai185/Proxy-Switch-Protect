import type { CheckerConfig, ExitIpResult } from './types';
import { normalizeCountry, normalizeIp, runChecker } from './checkers';

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return (await resp.text()).trim();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

const IPV4_ENDPOINTS = [
  'https://ipv4.icanhazip.com',
  'https://v4.ident.me',
  'https://api4.ipify.org',
  'https://api.ipify.org',
];

const IPV6_ENDPOINTS = [
  'https://ipv6.icanhazip.com',
  'https://v6.ident.me',
  'https://api6.ipify.org',
];

async function fetchFirstValidIp(
  urls: string[],
  timeoutMs: number,
  wantV4: boolean,
): Promise<string | undefined> {
  const promises = urls.map(async (u) => {
    const txt = await fetchText(u, timeoutMs);
    const ip = normalizeIp(txt);
    if (!ip) throw new Error('无效 IP');
    if (wantV4 && !isIpv4(ip)) throw new Error('非 IPv4');
    if (!wantV4 && isIpv4(ip)) throw new Error('非 IPv6');
    return ip;
  });
  try {
    return await Promise.any(promises);
  } catch {
    return undefined;
  }
}

interface GeoLookup {
  countryCode: string;
  city?: string;
  isp?: string;
  source: string;
}

/** 按已知 IP 查归属地（优先 ipwho.is，失败时降级使用 freeipapi） */
async function lookupGeo(ip: string, timeoutMs: number): Promise<GeoLookup> {
  try {
    const data = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`, timeoutMs);
    const obj = data as Record<string, unknown>;
    if (obj.success !== false) {
      const countryCode = normalizeCountry(obj.country_code);
      if (countryCode) {
        const conn = obj.connection as Record<string, unknown> | undefined;
        const isp =
          typeof conn?.isp === 'string'
            ? conn.isp
            : typeof conn?.org === 'string'
              ? conn.org
              : undefined;
        return {
          countryCode,
          city: typeof obj.city === 'string' && obj.city ? obj.city : undefined,
          isp,
          source: 'ipwho.is',
        };
      }
    }
  } catch {
    // 降级尝试备用接口
  }

  try {
    const data = await fetchJson(
      `https://freeipapi.com/api/json/${encodeURIComponent(ip)}`,
      timeoutMs,
    );
    const obj = data as Record<string, unknown>;
    const countryCode = normalizeCountry(obj.countryCode);
    if (countryCode) {
      return {
        countryCode,
        city: typeof obj.cityName === 'string' && obj.cityName ? obj.cityName : undefined,
        source: 'freeipapi',
      };
    }
  } catch {
    // 忽略异常抛出失败
  }

  throw new Error(`无法查询 IP ${ip} 的归属地`);
}

export function isIpv4(ip: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip);
}

/**
 * 双栈落地检测：
 * - 并行竞速拉取高可用 IPv4（icanhazip / ident.me / ipify）与 IPv6
 * - 分别查归属地；地理展示以 IPv4 为准
 * - 两侧国家不一致时 stackMismatch=true
 * - 若双栈独立探针失败，回退到用户配置的检测源（单 IP）并尽可能补齐 IPv4
 */
export async function runDualStackCheck(
  checkers: CheckerConfig[],
  timeoutMs: number,
): Promise<Omit<ExitIpResult, 'checkedAt' | 'profileId'>> {
  const [ipv4, ipv6] = await Promise.all([
    fetchFirstValidIp(IPV4_ENDPOINTS, timeoutMs, true),
    fetchFirstValidIp(IPV6_ENDPOINTS, timeoutMs, false),
  ]);

  if (ipv4 || ipv6) {
    const [g4, g6] = await Promise.all([
      ipv4 ? lookupGeo(ipv4, timeoutMs).catch(() => null) : Promise.resolve(null),
      ipv6 ? lookupGeo(ipv6, timeoutMs).catch(() => null) : Promise.resolve(null),
    ]);

    if ((ipv4 && g4) || (ipv6 && g6)) {
      const ipv4CountryCode = g4?.countryCode;
      const ipv6CountryCode = g6?.countryCode;
      const countryCode = ipv4CountryCode ?? ipv6CountryCode!;
      const stackMismatch = !!(
        ipv4CountryCode &&
        ipv6CountryCode &&
        ipv4CountryCode !== ipv6CountryCode
      );
      const primaryGeo = ipv4CountryCode ? g4 : g6;
      const sources = [
        ipv4 ? 'v4-probe' : null,
        ipv6 ? 'v6-probe' : null,
        primaryGeo?.source ?? null,
      ]
        .filter(Boolean)
        .join('+');

      return {
        ip: ipv4 ?? ipv6!,
        ipv4,
        ipv6,
        countryCode,
        ipv4CountryCode,
        ipv6CountryCode,
        stackMismatch,
        city: primaryGeo?.city,
        isp: primaryGeo?.isp,
        source: sources,
      };
    }
  }

  const errors: string[] = [];
  for (const cfg of checkers.filter((c) => c.enabled)) {
    try {
      const out = await runChecker(cfg, timeoutMs);
      const isV4 = isIpv4(out.ip);
      let v4 = isV4 ? out.ip : ipv4;
      const v6 = !isV4 ? out.ip : ipv6;
      if (!v4) {
        v4 = await fetchFirstValidIp(IPV4_ENDPOINTS, Math.min(2000, timeoutMs), true);
      }
      return {
        ip: v4 ?? out.ip,
        ipv4: v4,
        ipv6: v6,
        countryCode: out.countryCode,
        ipv4CountryCode: v4 ? out.countryCode : undefined,
        ipv6CountryCode: v6 ? out.countryCode : undefined,
        stackMismatch: false,
        city: out.city,
        isp: out.isp,
        source: out.source,
      };
    } catch (e) {
      errors.push(`${cfg.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(errors.length > 0 ? errors.join('；') : '没有启用任何检测源');
}

/** 规则匹配用 IP：优先 IPv4（CIDR 仅支持 v4） */
export function primaryMatchIp(r: Pick<ExitIpResult, 'ip' | 'ipv4'>): string {
  return r.ipv4 ?? r.ip;
}
