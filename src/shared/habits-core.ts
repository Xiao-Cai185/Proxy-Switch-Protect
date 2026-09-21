import { domainMatchesPattern } from './matchers';
import type { HabitStore, ProtectedSite } from './types';

/** 本地时区的 YYYY-MM-DD */
export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** dateStr 偏移 deltaDays 天（字符串比较即时间比较） */
export function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** 记录一次访问（按天去重）。返回是否发生变更。会就地修改 habits。 */
export function recordVisit(
  habits: HabitStore,
  domain: string,
  countryCode: string,
  date: string,
): boolean {
  const byCountry = (habits[domain] ??= {});
  const dates = (byCountry[countryCode] ??= []);
  if (dates.includes(date)) return false;
  dates.push(date);
  return true;
}

/** 清理超过保留期的记录。返回是否发生变更。会就地修改 habits。 */
export function pruneHabits(
  habits: HabitStore,
  today: string,
  retentionDays: number,
): boolean {
  const cutoff = shiftDate(today, -retentionDays);
  let changed = false;
  for (const domain of Object.keys(habits)) {
    const byCountry = habits[domain];
    for (const cc of Object.keys(byCountry)) {
      const kept = byCountry[cc].filter((d) => d >= cutoff);
      if (kept.length !== byCountry[cc].length) {
        changed = true;
        if (kept.length === 0) delete byCountry[cc];
        else byCountry[cc] = kept;
      }
    }
    if (Object.keys(byCountry).length === 0) {
      delete habits[domain];
      changed = true;
    }
  }
  return changed;
}

/** 某域名是否已被启用中的守护规则覆盖 */
export function domainCovered(sites: ProtectedSite[], domain: string): boolean {
  return sites.some(
    (s) =>
      s.enabled &&
      domainMatchesPattern(domain, s.domainPattern),
  );
}

export interface SuggestOpts {
  windowDays: number;
  minDays: number;
  ratio: number;
}

export interface SuggestionResult {
  countryCode: string;
  /** 窗口期内不同访问日期数（跨国家取并集） */
  days: number;
  /** 主导国家占比 */
  share: number;
}

/**
 * 计算某域名的绑定建议：
 * 窗口期内不同访问天数 >= minDays 且主导国家占比 >= ratio 时给出建议。
 */
export function computeSuggestion(
  habits: HabitStore,
  domain: string,
  opts: SuggestOpts,
  today: string,
): SuggestionResult | null {
  const rec = habits[domain];
  if (!rec) return null;
  const cutoff = shiftDate(today, -opts.windowDays);

  const counts: Record<string, number> = {};
  const allDays = new Set<string>();
  let total = 0;
  for (const [cc, dates] of Object.entries(rec)) {
    const inWindow = dates.filter((d) => d >= cutoff);
    if (inWindow.length > 0) {
      counts[cc] = inWindow.length;
      total += inWindow.length;
      for (const d of inWindow) allDays.add(d);
    }
  }
  if (total === 0 || allDays.size < opts.minDays) return null;

  let top = '';
  let topCount = 0;
  for (const [cc, n] of Object.entries(counts)) {
    if (n > topCount) {
      top = cc;
      topCount = n;
    }
  }
  const share = topCount / total;
  if (share < opts.ratio) return null;
  return { countryCode: top, days: allDays.size, share };
}
