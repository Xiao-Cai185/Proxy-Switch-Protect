import {
  ALARM_BYPASS_PREFIX,
  ALARM_RECHECK,
  DEFAULT_BYPASS_MINUTES,
  K,
  SCHEMA_VERSION,
} from '../shared/constants';
import type { BgCommand, BgResponse } from '../shared/messages';
import {
  getLocal,
  loadActiveProfileId,
  loadSettings,
  loadSites,
  saveSettings,
  setLocal,
} from '../shared/storage';
import { urlMatchesDomain } from '../shared/matchers';
import type { ProxyProfile, Settings } from '../shared/types';
import * as guard from './guard-engine';
import { acceptSuggestion, dismissSuggestion, initHabitLearner } from './habit-learner';
import { testChecker, testProfileIsolated } from './ip-checker';
import {
  applyProfileById,
  getLevelOfControl,
  initAuthListener,
  isBuiltinProfile,
  reapplyActiveProfile,
} from './proxy-manager';
import {
  initTrafficPolicy,
  recordStrictResourceRequest,
  recordTabRequest,
  resolveEffectiveLevel,
} from './traffic-policy';
import { applyWebRtcPolicy } from './webrtc-policy';

/* ---------- 事件注册（必须在 SW 顶层同步完成） ---------- */

initAuthListener();
initHabitLearner();
initTrafficPolicy();

/** 后续交互流量只读监听：针对抽样检测模式（Level 2）与严格模式（Level 1 宽容计数/周期复检）触发平滑二次复核 */
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId <= 0) return undefined;
    void handleSubsequentRequest(details.tabId, details.url).catch(() => undefined);
    return undefined;
  },
  { urls: ['<all_urls>'] },
);

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    const ver = await getLocal<number | null>(K.schemaVersion, null);
    if (ver === null) {
      await setLocal(K.schemaVersion, SCHEMA_VERSION);
      await saveSettings(await loadSettings());
    }
    await applyWebRtcPolicy().catch(() => undefined);
  })();
});

chrome.runtime.onMessage.addListener(
  (msg: BgCommand, _sender, sendResponse: (resp: BgResponse) => void) => {
    handleCommand(msg).then(
      (data) => sendResponse({ ok: true, data }),
      (e: unknown) =>
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true;
  },
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_RECHECK) {
    void guard.recheckAndApply(true).catch(() => undefined);
  } else if (alarm.name.startsWith(ALARM_BYPASS_PREFIX)) {
    const siteId = alarm.name.slice(ALARM_BYPASS_PREFIX.length);
    void guard.onBypassExpired(siteId).catch(() => undefined);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (K.sites in changes) void guard.onSitesChanged().catch(() => undefined);
    if (K.settings in changes) {
      void rescheduleRecheck().catch(() => undefined);
      const oldS = changes[K.settings].oldValue as Settings | undefined;
      const next = changes[K.settings].newValue as Settings | undefined;
      if (next && typeof next.webrtcProtect === 'boolean') {
        void applyWebRtcPolicy(next.webrtcProtect).catch(() => undefined);
      }
      void guard.onSettingsChanged(oldS, next).catch(() => undefined);
    }
    if (K.activeProfileId in changes) {
      void guard.updateBadge().catch(() => undefined);
    }
    if (K.profiles in changes) {
      void handleProfilesChanged(
        changes[K.profiles].oldValue as ProxyProfile[] | undefined,
        changes[K.profiles].newValue as ProxyProfile[] | undefined,
      ).catch(() => undefined);
    }
  } else if (area === 'session') {
    void guard.updateBadge().catch(() => undefined);
  }
});

/**
 * 访问名单内网址：主框架导航（开屏首检或主框架切页）
 */
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  void guard.onProtectedAccess(details.url, details.tabId).catch(() => undefined);
});

/** 切回 / 重新打开命中规则的标签页 */
chrome.tabs.onActivated.addListener((info) => {
  void (async () => {
    const tab = await chrome.tabs.get(info.tabId);
    if (tab.url) await guard.onProtectedAccess(tab.url, info.tabId);
  })().catch(() => undefined);
});

/** 休眠标签被唤醒加载或页面状态更新 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading' || !tab.url) return;
  void guard.onProtectedAccess(tab.url, tabId).catch(() => undefined);
});

async function handleSubsequentRequest(tabId: number, url: string): Promise<void> {
  const [sites, settings] = await Promise.all([loadSites(), loadSettings()]);
  const hit = sites.find((s) => s.enabled && urlMatchesDomain(url, s.domainPattern));
  if (!hit) return;

  const level = resolveEffectiveLevel(hit, settings);
  if (level === 'sampling') {
    const shouldSample = await recordTabRequest(tabId, hit.id);
    if (shouldSample) {
      void guard.triggerSamplingCheck(hit.id).catch(() => undefined);
    }
  } else if (level === 'strict') {
    const { shouldRecheck } = await recordStrictResourceRequest(
      tabId,
      hit.id,
      settings.strictToleranceCount ?? 5,
      settings.strictRecheckMinutes ?? 5,
    );
    if (shouldRecheck) {
      void guard.triggerStrictPeriodicRecheck(hit.id, tabId).catch(() => undefined);
    }
  }
}

void init();

/* ---------- 编排 ---------- */

async function init(): Promise<void> {
  await applyWebRtcPolicy().catch(() => undefined);
  await guard.initGuard();
  await rescheduleRecheck();
  await guard.updateBadge();
}

async function handleCommand(cmd: BgCommand): Promise<unknown> {
  switch (cmd.type) {
    case 'switchProfile': {
      await applyProfileById(cmd.profileId);
      return guard.lockAndRecheck('切换代理，等待验证');
    }
    case 'recheckIp':
      return guard.recheckAndApply(true);
    case 'forceAllow':
      return guard.forceAllowSite(cmd.siteId, cmd.minutes ?? DEFAULT_BYPASS_MINUTES);
    case 'relockAll':
      return guard.relockAll();
    case 'pauseGuard':
      return guard.pauseAll(cmd.minutes ?? 5);
    case 'acceptSuggestion':
      return acceptSuggestion(
        cmd.domain,
        cmd.countryCode,
        cmd.expectedIpRanges,
        cmd.matchMode,
      );
    case 'dismissSuggestion':
      return dismissSuggestion(cmd.domain);
    case 'testChecker':
      return testChecker(cmd.checker);
    case 'testProfile':
      return testProfileIsolated(cmd.profileId);
    case 'getLevelOfControl':
      return getLevelOfControl();
    case 'verifyAndAllowTab':
      return guard.verifyAndAuthorizeTab(cmd.siteId, cmd.tabId);
    default:
      throw new Error('未知指令');
  }
}

function isProxyConnectionEqual(a?: ProxyProfile, b?: ProxyProfile): boolean {
  if (!a || !b) return a === b;
  return (
    a.host === b.host &&
    a.port === b.port &&
    a.scheme === b.scheme &&
    JSON.stringify(a.bypassList ?? []) === JSON.stringify(b.bypassList ?? []) &&
    JSON.stringify(a.auth ?? null) === JSON.stringify(b.auth ?? null)
  );
}

async function handleProfilesChanged(
  oldList: ProxyProfile[] | undefined,
  newList: ProxyProfile[] | undefined,
): Promise<void> {
  const activeId = await loadActiveProfileId();
  if (!activeId || isBuiltinProfile(activeId)) return;
  const oldP = oldList?.find((p) => p.id === activeId);
  const newP = newList?.find((p) => p.id === activeId);
  if (!newP) {
    await applyProfileById('direct');
    await guard.lockAndRecheck('激活档案已删除，已退回直连');
  } else if (!isProxyConnectionEqual(oldP, newP)) {
    await reapplyActiveProfile();
    await guard.lockAndRecheck('激活档案已修改，等待验证');
  }
}

async function rescheduleRecheck(): Promise<void> {
  const settings = await loadSettings();
  await chrome.alarms.clear(ALARM_RECHECK);
  if (settings.recheckMinutes > 0) {
    chrome.alarms.create(ALARM_RECHECK, {
      periodInMinutes: Math.max(0.5, settings.recheckMinutes),
    });
  }
}

