import { FRESH_RESULT_MS, SK } from '../shared/constants';
import { evaluateSiteDetails, isFresh } from '../shared/matchers';
import { getLocal, getSession, setLocal, setSession } from '../shared/storage';
import type {
  CheckState,
  ProtectedSite,
  Settings,
  TrafficValidationLevel,
} from '../shared/types';

/**
 * 标签页安全会话：
 * 记录通过开屏验证的标签页状态，支持第二等级（抽样检测）、第三等级（宽松效率模式）、第四等级（时间画像）以及严格模式（宽容计数与周期复检）。
 */
export interface TabSession {
  tabId: number;
  /** 该标签页已通过开屏验证的受保护站点 ID 集合及时间戳 */
  verifiedSites: Record<string, number>;
  requestCount: number;
  lastSampleCheckAt: number;
  /** 严格模式：单次标签页已验证放行的页内资源计数 */
  strictResourceCount?: Record<string, number>;
  /** 严格模式：上一次周期复检的时间戳 */
  strictLastRecheckAt?: Record<string, number>;
}

/** 站点时间画像历史记录（用于第 1 等级 time_window 策略） */
export interface SiteVerificationRecord {
  timestamp: number;
  profileId: string;
}

const SK_SITE_VERIFICATIONS = 'siteVerifications';
let siteVerificationsCache: Record<string, SiteVerificationRecord> | null = null;

async function loadSiteVerifications(): Promise<Record<string, SiteVerificationRecord>> {
  if (siteVerificationsCache) return siteVerificationsCache;
  const stored = await getLocal<Record<string, SiteVerificationRecord> | null>(
    SK_SITE_VERIFICATIONS,
    null,
  );
  siteVerificationsCache = stored ?? {};
  return siteVerificationsCache;
}

async function persistSiteVerifications(): Promise<void> {
  if (!siteVerificationsCache) return;
  await setLocal(SK_SITE_VERIFICATIONS, siteVerificationsCache);
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
 * 记录站点时间画像验证成功记录（用于第 1 等级 time_window 策略）
 */
export async function recordSiteVerification(
  siteId: string,
  profileId: string,
): Promise<void> {
  const map = await loadSiteVerifications();
  map[siteId] = {
    timestamp: Date.now(),
    profileId,
  };
  await persistSiteVerifications();
}

/**
 * 移除单个站点的时间画像验证记录（该站点异常违规锁定时）
 */
export async function removeSiteVerification(siteId: string): Promise<void> {
  const map = await loadSiteVerifications();
  if (siteId in map) {
    delete map[siteId];
    await persistSiteVerifications();
  }
}

/**
 * 清空全部站点时间画像验证记录（切换代理或手动全部锁定时）
 */
export async function clearSiteVerifications(): Promise<void> {
  siteVerificationsCache = {};
  await persistSiteVerifications();
}

/**
 * 判定受保护站点是否在时间画像的免检窗口期内（且当前代理节点一致）
 */
export async function isSiteWithinTimeWindow(
  siteId: string,
  profileId: string,
  windowMinutes: number,
): Promise<boolean> {
  if (windowMinutes <= 0) return false;
  const map = await loadSiteVerifications();
  const rec = map[siteId];
  if (!rec) return false;
  if (rec.profileId !== profileId) return false;
  const elapsed = Date.now() - rec.timestamp;
  if (elapsed > windowMinutes * 60_000) {
    delete map[siteId];
    void persistSiteVerifications().catch(() => undefined);
    return false;
  }
  return true;
}

/**
 * 严格模式下处理单标签页内的页内资源请求：
 * - 验证通过 5 条（或设定值）页内资源后宽容放行后续资源，避免网页整体不可用
 * - 每隔设定分钟（默认 5 分钟）返回 shouldRecheck = true，触发后台异步静默复检
 */
export async function recordStrictResourceRequest(
  tabId: number,
  siteId: string,
  toleranceCount = 5,
  recheckMinutes = 5,
): Promise<{ shouldRecheck: boolean; isTolerated: boolean }> {
  if (tabId <= 0) return { shouldRecheck: false, isTolerated: false };
  const map = await loadSessions();
  const s = map[tabId];
  if (!s || !s.verifiedSites || !s.verifiedSites[siteId]) {
    return { shouldRecheck: false, isTolerated: false };
  }

  if (!s.strictResourceCount) s.strictResourceCount = {};
  if (!s.strictLastRecheckAt) s.strictLastRecheckAt = {};

  const currentCount = s.strictResourceCount[siteId] ?? 0;
  s.strictResourceCount[siteId] = currentCount + 1;

  const now = Date.now();
  const lastRecheck = s.strictLastRecheckAt[siteId] ?? s.verifiedSites[siteId] ?? now;
  const isTolerated = s.strictResourceCount[siteId] >= toleranceCount;

  let shouldRecheck = false;
  if (recheckMinutes > 0 && now - lastRecheck >= recheckMinutes * 60_000) {
    s.strictLastRecheckAt[siteId] = now;
    shouldRecheck = true;
  }

  await persistSessions();
  return { shouldRecheck, isTolerated };
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
