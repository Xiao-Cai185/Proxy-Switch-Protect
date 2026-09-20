import {
  ALARM_BYPASS_PREFIX,
  ALARM_RECHECK,
  DEFAULT_BYPASS_MINUTES,
  K,
  SCHEMA_VERSION,
} from '../shared/constants';
import type { BgCommand, BgResponse } from '../shared/messages';
import {
  getCheckState,
  getGuardStates,
  getLocal,
  loadActiveProfileId,
  loadSettings,
  saveSettings,
  setLocal,
} from '../shared/storage';
import type { ProxyProfile } from '../shared/types';
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
import { applyWebRtcPolicy } from './webrtc-policy';

/* ---------- 事件注册（必须在 SW 顶层同步完成） ---------- */

initAuthListener();
initHabitLearner();

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
      const next = changes[K.settings].newValue as { webrtcProtect?: boolean } | undefined;
      if (next && typeof next.webrtcProtect === 'boolean') {
        void applyWebRtcPolicy(next.webrtcProtect).catch(() => undefined);
      }
    }
    if (K.profiles in changes) {
      void handleProfilesChanged(
        changes[K.profiles].oldValue as ProxyProfile[] | undefined,
        changes[K.profiles].newValue as ProxyProfile[] | undefined,
      ).catch(() => undefined);
    }
  } else if (area === 'session') {
    void updateBadge().catch(() => undefined);
  }
});

/**
 * 访问名单内网址：主框架导航前立刻锁 + 强制查 IP（不复用旧结果）。
 */
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  void guard.onProtectedAccess(details.url).catch(() => undefined);
});

/** 切回 / 重新打开命中规则的标签页：同样先锁再强制重验 */
chrome.tabs.onActivated.addListener((info) => {
  void (async () => {
    const tab = await chrome.tabs.get(info.tabId);
    if (tab.url) await guard.onProtectedAccess(tab.url);
  })().catch(() => undefined);
});

/** 休眠标签被唤醒加载时再验一次 */
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading' || !tab.url) return;
  void guard.onProtectedAccess(tab.url).catch(() => undefined);
});

void init();

/* ---------- 编排 ---------- */

async function init(): Promise<void> {
  await applyWebRtcPolicy().catch(() => undefined);
  await guard.initGuard();
  await rescheduleRecheck();
  await updateBadge();
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

async function updateBadge(): Promise<void> {
  const [cs, gs] = await Promise.all([getCheckState(), getGuardStates()]);
  let text = '';
  let color = '#64748b';
  if (cs.status === 'checking') {
    text = '…';
  } else if (cs.status === 'error') {
    text = '!';
    color = '#dc2626';
  } else if (cs.status === 'ok' && cs.result) {
    text = cs.result.countryCode;
    const anyLocked = Object.values(gs).some((s) => s.status === 'locked');
    const mismatch = cs.result.stackMismatch;
    color = anyLocked ? '#ea580c' : mismatch ? '#d97706' : '#16a34a';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}
