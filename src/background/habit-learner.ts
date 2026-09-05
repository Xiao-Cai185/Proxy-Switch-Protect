import { FRESH_RESULT_MS, HABIT_RETENTION_DAYS } from '../shared/constants';
import { countryName } from '../shared/countries';
import {
  computeSuggestion,
  domainCovered,
  pruneHabits,
  recordVisit,
  todayStr,
} from '../shared/habits-core';
import { getRegistrableDomain, isFresh } from '../shared/matchers';
import {
  getCheckState,
  loadActiveProfileId,
  loadDismissed,
  loadHabits,
  loadSettings,
  loadSites,
  loadSuggestions,
  saveDismissed,
  saveHabits,
  saveSites,
  saveSuggestions,
} from '../shared/storage';
import type { ProtectedSite, Settings } from '../shared/types';
import { activeKeyOf } from './ip-checker';

/**
 * 使用习惯学习：
 * 仅在"检测结果新鲜且指纹与当前代理一致"时记录 (域名, 落地国家, 日期)，
 * 高频稳定的组合会生成守护绑定建议。全部数据仅存本地。
 */

export function initHabitLearner(): void {
  chrome.webNavigation.onCommitted.addListener((details) => {
    void handleNavigation(details.frameId, details.url).catch(() => undefined);
  });

  chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
    if (!id.startsWith('suggest:')) return;
    const [, domain, cc] = id.split(':');
    void (buttonIndex === 0 ? acceptSuggestion(domain, cc) : dismissSuggestion(domain));
    chrome.notifications.clear(id);
  });
}

async function handleNavigation(frameId: number, url: string): Promise<void> {
  if (frameId !== 0 || !/^https?:\/\//i.test(url)) return;

  const settings = await loadSettings();
  if (!settings.habitEnabled) return;

  const cs = await getCheckState();
  if (cs.status !== 'ok' || !cs.result) return;
  if (!isFresh(cs.result.checkedAt, FRESH_RESULT_MS)) return;
  const activeKey = activeKeyOf(await loadActiveProfileId());
  if (cs.result.profileId !== activeKey) return;

  const domain = getRegistrableDomain(new URL(url).hostname);
  if (!domain.includes('.')) return;

  const habits = await loadHabits();
  const today = todayStr();
  const recorded = recordVisit(habits, domain, cs.result.countryCode, today);
  const pruned = pruneHabits(habits, today, HABIT_RETENTION_DAYS);
  if (recorded || pruned) await saveHabits(habits);

  await maybeSuggest(domain, settings);
}

async function maybeSuggest(domain: string, settings: Settings): Promise<void> {
  const sites = await loadSites();
  if (domainCovered(sites, domain)) return;
  const dismissed = await loadDismissed();
  if (dismissed.includes(domain)) return;
  const suggestions = await loadSuggestions();
  if (suggestions.some((s) => s.domain === domain)) return;

  const habits = await loadHabits();
  const res = computeSuggestion(
    habits,
    domain,
    {
      windowDays: settings.suggestWindowDays,
      minDays: settings.suggestMinDays,
      ratio: settings.suggestRatio,
    },
    todayStr(),
  );
  if (!res) return;

  suggestions.push({
    domain,
    countryCode: res.countryCode,
    days: res.days,
    createdAt: Date.now(),
  });
  await saveSuggestions(suggestions);

  if (settings.notifySuggestions) {
    try {
      chrome.notifications.create(`suggest:${domain}:${res.countryCode}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Proxy Protect 绑定建议',
        message: `最近 ${res.days} 天访问 ${domain} 均使用 ${countryName(res.countryCode)}（${res.countryCode}）落地，建议创建守护绑定。`,
        buttons: [{ title: '立即绑定' }, { title: '忽略' }],
        priority: 1,
      });
    } catch {
      // 通知不可用时静默跳过
    }
  }
}

/** 接受建议：创建守护规则并移出建议列表 */
export async function acceptSuggestion(domain: string, countryCode: string): Promise<void> {
  const sites = await loadSites();
  if (!domainCovered(sites, domain)) {
    const now = Date.now();
    const site: ProtectedSite = {
      id: crypto.randomUUID(),
      domainPattern: domain,
      expectedCountries: [countryCode],
      expectedIpRanges: [],
      matchMode: 'any',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    await saveSites([...sites, site]);
  }
  const suggestions = await loadSuggestions();
  await saveSuggestions(suggestions.filter((s) => s.domain !== domain));
}

/** 忽略建议：不再对该域名提示 */
export async function dismissSuggestion(domain: string): Promise<void> {
  const dismissed = await loadDismissed();
  if (!dismissed.includes(domain)) {
    dismissed.push(domain);
    await saveDismissed(dismissed);
  }
  const suggestions = await loadSuggestions();
  await saveSuggestions(suggestions.filter((s) => s.domain !== domain));
}
