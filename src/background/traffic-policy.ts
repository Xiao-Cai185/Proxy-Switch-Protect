import { FRESH_RESULT_MS, SK } from '../shared/constants';
import { evaluateSiteDetails, isFresh } from '../shared/matchers';
import { getSession, setSession } from '../shared/storage';
import type {
  CheckState,
  ProtectedSite,
  Settings,
  TrafficValidationLevel,
} from '../shared/types';

/**
 * 标签页安全会话：
 * 记录通过开屏验证的标签页状态，支持第二等级（抽样检测）与第三等级（宽松效率模式）。
 */
export interface TabSession {
  tabId: number;
  /** 该标签页已通过开屏验证的受保护站点 ID 集合及时间戳 */
  verifiedSites: Record<string, number>;
  requestCount: number;
  lastSampleCheckAt: number;
}

/** 内存高速缓存，与 chrome.storage.session 双向保持一致 */
let sessionsCache: Record<number, TabSession> | null = null;

async function loadSessions(): Promise<Record<number, TabSession>> {
  if (sessionsCache) return sessionsCache;
  const stored = await getSession<Record<number, TabSession> | null>(SK.tabSessions, null);
  sessionsCache = stored ?? {};
  return sessionsCache;
}

async function persistSessions(): Promise<void> {
  if (!sessionsCache) return;
  await setSession(SK.tabSessions, sessionsCache);
}

/**
 * 解析站点实际生效的流量判定策略等级：
 * 优先读取站点自定义 validationLevel（若非 default），否则回退到全局 settings.trafficValidationLevel。
 */
export function resolveEffectiveLevel(
  site: ProtectedSite,
  settings: Settings,
): TrafficValidationLevel {
  if (site.validationLevel && site.validationLevel !== 'default') {
    return site.validationLevel;
  }
  return settings.trafficValidationLevel || 'relaxed';
}

/**
 * 判定指定标签页是否已经通过了该站点的开屏检验
 */
export async function isTabSessionVerified(
  tabId: number,
  siteId: string,
): Promise<boolean> {
  if (tabId <= 0) return false;
  const map = await loadSessions();
  const s = map[tabId];
  if (!s || !s.verifiedSites) return false;
  return Boolean(s.verifiedSites[siteId]);
}

/**
 * 获取指定受保护站点已放行的全部标签页 ID 列表（用于 DNR Session 规则的 excludedTabIds）
 */
export async function getExcludedTabIdsForSite(siteId: string): Promise<number[]> {
  const map = await loadSessions();
  const tabIds: number[] = [];
  for (const [idStr, s] of Object.entries(map)) {
    if (s && s.verifiedSites && s.verifiedSites[siteId]) {
      const id = Number(idStr);
      if (id > 0) tabIds.push(id);
    }
  }
  return tabIds;
}

/**
 * 标记标签页已成功通过开屏校验并加入该站点的放行白名单
 */
export async function markTabVerified(
  tabId: number,
  siteId: string,
  _domain?: string,
): Promise<void> {
  if (tabId <= 0) return;
  const map = await loadSessions();
  const now = Date.now();
  const s = map[tabId] ?? {
    tabId,
    verifiedSites: {},
    requestCount: 0,
    lastSampleCheckAt: now,
  };
  if (!s.verifiedSites) s.verifiedSites = {};
  s.verifiedSites[siteId] = now;
  map[tabId] = s;
  await persistSessions();
}

/**
 * 标签页关闭或导航到其他不相关页面时清理会话
 */
export async function removeTabSession(tabId: number): Promise<void> {
  if (tabId <= 0) return;
  const map = await loadSessions();
  if (tabId in map) {
    delete map[tabId];
    await persistSessions();
  }
}

/**
 * 换代理、规则变更或强行锁定时一键清空所有标签页放行会话
 */
export async function clearAllTabSessions(): Promise<void> {
  sessionsCache = {};
  await persistSessions();
}

/**
 * 抽样阈值参数：
 * - SAMPLING_REQUEST_INTERVAL: 页面内后续每 15 次交互请求触发一次二次抽样
 * - SAMPLING_TIME_INTERVAL_MS: 或距离上次抽检超过 60 秒触发一次二次抽样
 */
export const SAMPLING_REQUEST_INTERVAL = 15;
export const SAMPLING_TIME_INTERVAL_MS = 60_000;

/**
 * 记录后续页面内交互请求并判定是否命中抽样复检
 * @returns true 表示命中抽样复检，需触发平滑二次校验
 */
export async function recordTabRequest(
  tabId: number,
  siteId: string,
): Promise<boolean> {
  if (tabId <= 0) return false;
  const map = await loadSessions();
  const s = map[tabId];
  if (!s || !s.verifiedSites || !s.verifiedSites[siteId]) return false;

  s.requestCount = (s.requestCount ?? 0) + 1;
  const now = Date.now();
  const timeTrigger = now - (s.lastSampleCheckAt ?? 0) >= SAMPLING_TIME_INTERVAL_MS;
  const countTrigger = s.requestCount >= SAMPLING_REQUEST_INTERVAL;

  if (timeTrigger || countTrigger) {
    s.requestCount = 0;
    s.lastSampleCheckAt = now;
    await persistSessions();
    return true;
  }

  return false;
}

/**
 * 验证当前检测状态是否仍然满足特定受保护站点的期望
 */
export function isCheckStateMatching(
  site: ProtectedSite,
  cs: CheckState,
  activeProfileKey: string,
  webrtcProtect = true,
): boolean {
  if (cs.status !== 'ok' || !cs.result) return false;
  if (cs.result.profileId !== activeProfileKey) return false;
  if (!isFresh(cs.result.checkedAt, FRESH_RESULT_MS)) return false;

  const matchIp = cs.result.ipv4 || cs.result.ip;
  const evalRes = evaluateSiteDetails(site, matchIp, cs.result.countryCode);
  return evalRes.pass && webrtcProtect;
}

/**
 * 初始化流量策略系统（自动监听标签页关闭事件）
 */
export function initTrafficPolicy(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void removeTabSession(tabId).catch(() => undefined);
  });
}
