import { ALARM_BYPASS_PREFIX } from '../shared/constants';
import { countryName } from '../shared/countries';
import { primaryMatchIp } from '../shared/dual-stack';
import { evaluateSiteDetails, urlMatchesDomain } from '../shared/matchers';
import { buildSiteRules, type DnrRuleJson } from '../shared/rules';
import {
  getCheckState,
  getGuardStates,
  loadActiveProfileId,
  loadSettings,
  loadSites,
  setGuardStates,
} from '../shared/storage';
import type { CheckState, GuardState, ProtectedSite } from '../shared/types';
import { activeKeyOf, ensureCheck } from './ip-checker';

/**
 * 守护引擎：核心为 fail-closed 状态机。
 * - locked / checking 状态 = DNR 拦截规则在位（由浏览器同步执行，不依赖本 SW 存活）
 * - 只有拿到「与当前代理指纹一致」的**强制新检测**结果且匹配期望时才移除规则放行
 * - 访问名单域名 / 重新打开命中标签页时：先锁再强制查 IP，禁止沿用旧结果
 */

/* ---------- 串行化队列 ---------- */

let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

/* ---------- declarativeNetRequest ---------- */

function dnrGetRules(): Promise<chrome.declarativeNetRequest.Rule[]> {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(rules);
    });
  });
}

function dnrUpdate(options: chrome.declarativeNetRequest.UpdateRuleOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.updateDynamicRules(options, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

const blockedBase = () => chrome.runtime.getURL('blocked.html');

async function _setAll(
  sites: ProtectedSite[],
  states: Record<string, GuardState>,
): Promise<void> {
  const rules: DnrRuleJson[] = [];
  let id = 1;
  for (const site of sites) {
    if (!site.enabled) continue;
    const st = states[site.id];
    if (st && (st.status === 'locked' || st.status === 'checking')) {
      rules.push(...buildSiteRules(site.id, site.domainPattern, [id++, id++], blockedBase()));
    }
  }
  const existing = await dnrGetRules();
  await dnrUpdate({
    removeRuleIds: existing.map((r) => r.id),
    addRules: rules as unknown as chrome.declarativeNetRequest.Rule[],
  });
  await setGuardStates(states);
}

/* ---------- 状态计算 ---------- */

async function recomputeFromCheck(
  cs: CheckState,
  notify: boolean,
  ignoreBypass = false,
): Promise<void> {
  const [sites, prev, activeId, settings] = await Promise.all([
    loadSites(),
    getGuardStates(),
    loadActiveProfileId(),
    loadSettings(),
  ]);
  const activeKey = activeKeyOf(activeId);
  const now = Date.now();
  const webrtcProtect = settings.webrtcProtect !== false;
  const states: Record<string, GuardState> = {};
  const newlyLocked: { site: ProtectedSite; cc?: string }[] = [];

  for (const site of sites.filter((s) => s.enabled)) {
    const p = prev[site.id];
    if (!ignoreBypass && p?.status === 'bypass' && p.bypassUntil && p.bypassUntil > now) {
      states[site.id] = p;
      continue;
    }
    let next: GuardState;
    if (cs.status === 'ok' && cs.result && cs.result.profileId === activeKey) {
      const matchIp = primaryMatchIp(cs.result);
      const evalRes = evaluateSiteDetails(site, matchIp, cs.result.countryCode);
      const isPass = evalRes.pass && webrtcProtect;

      let reason = '';
      if (!isPass) {
        const failureParts: string[] = [];
        if (!evalRes.countryMatch && evalRes.hasCountryConfig) {
          failureParts.push(
            `落地地区不匹配（当前 ${countryName(cs.result.countryCode)} / ${cs.result.countryCode}）`,
          );
        }
        if (!evalRes.ipMatch && evalRes.hasIpConfig) {
          failureParts.push(`出口 IP 不符合允许网段（当前 ${matchIp}）`);
        }
        if (!evalRes.hasCountryConfig && !evalRes.hasIpConfig) {
          failureParts.push('该站点未配置任何期望地区或网段规则');
        }
        if (!webrtcProtect) {
          failureParts.push('WebRTC 防护未开启（存在真实公网 IP 泄露风险）');
        }
        reason = failureParts.join('；') || '未达到安全放行要求';
      }

      next = isPass
        ? { siteId: site.id, status: 'allowed', updatedAt: now }
        : {
            siteId: site.id,
            status: 'locked',
            reason,
            updatedAt: now,
          };
      if (!isPass && p?.status === 'allowed') newlyLocked.push({ site, cc: cs.result.countryCode });
    } else if (cs.status === 'checking') {
      next = { siteId: site.id, status: 'checking', reason: '正在验证落地 IP', updatedAt: now };
    } else {
      next = {
        siteId: site.id,
        status: 'locked',
        reason:
          cs.status === 'error'
            ? '无法确认落地 IP，为安全起见保持拦截'
            : '等待落地 IP 验证',
        updatedAt: now,
      };
      if (p?.status === 'allowed') newlyLocked.push({ site });
    }
    states[site.id] = next;
  }

  await _setAll(sites, states);
  if (notify) for (const { site, cc } of newlyLocked) notifyLocked(site, cc);
}

function notifyLocked(site: ProtectedSite, cc?: string): void {
  try {
    chrome.notifications.create(`locked:${site.id}:${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Proxy Protect 已锁定站点',
      message: cc
        ? `${site.domainPattern}：当前落地 ${countryName(cc)}（${cc}）与期望不符，已中断访问`
        : `${site.domainPattern}：无法确认落地 IP，已中断访问`,
    });
  } catch {
    // ignore
  }
}

async function clearBypassAlarms(): Promise<void> {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms
      .filter((a) => a.name.startsWith(ALARM_BYPASS_PREFIX))
      .map((a) => chrome.alarms.clear(a.name)),
  );
}

function matchingSites(url: string, sites: ProtectedSite[]): ProtectedSite[] {
  if (!/^https?:\/\//i.test(url)) return [];
  return sites.filter((s) => s.enabled && urlMatchesDomain(url, s.domainPattern));
}

/** 同一批站点短时间内只触发一次，避免 onBeforeNavigate + onActivated 风暴 */
const accessStamp = new Map<string, number>();
const ACCESS_DEBOUNCE_MS = 1500;

/**
 * 访问名单域名 / 重新打开命中标签页：
 * 立刻 DNR 锁定（checking），再强制发起新的落地 IP 检测。
 * 禁止复用旧结果，避免「上次是对的 → 代理已漂 → 意外放行」。
 */
export async function onProtectedAccess(url: string): Promise<void> {
  const sites = await loadSites();
  const hits = matchingSites(url, sites);
  if (hits.length === 0) return;

  const key = hits
    .map((h) => h.id)
    .sort()
    .join(',');
  const now = Date.now();
  if ((accessStamp.get(key) ?? 0) + ACCESS_DEBOUNCE_MS > now) return;
  accessStamp.set(key, now);

  await serialize(async () => {
    const prev = await getGuardStates();
    const t = Date.now();
    const states = { ...prev };
    for (const site of hits) {
      if (
        states[site.id]?.status === 'bypass' &&
        states[site.id].bypassUntil &&
        states[site.id].bypassUntil! > t
      ) {
        continue;
      }
      states[site.id] = {
        siteId: site.id,
        status: 'checking',
        reason: '访问前重新验证落地 IP',
        updatedAt: t,
      };
    }
    await _setAll(sites, states);
  });
  await recheckAndApply(true);
}

/** SW / 浏览器启动：默认全锁，再强制验 IP */
export async function initGuard(): Promise<void> {
  await serialize(async () => {
    const sites = await loadSites();
    const now = Date.now();
    const states: Record<string, GuardState> = {};
    for (const site of sites.filter((s) => s.enabled)) {
      states[site.id] = {
        siteId: site.id,
        status: 'checking',
        reason: '启动后重新验证落地 IP',
        updatedAt: now,
      };
    }
    await _setAll(sites, states);
  });
  await recheckAndApply(true);
}

export async function lockAndRecheck(reason: string): Promise<CheckState> {
  await clearBypassAlarms();
  await serialize(async () => {
    const sites = await loadSites();
    const now = Date.now();
    const states: Record<string, GuardState> = {};
    for (const site of sites.filter((s) => s.enabled)) {
      states[site.id] = { siteId: site.id, status: 'checking', reason, updatedAt: now };
    }
    await _setAll(sites, states);
  });
  return recheckAndApply(true);
}

/** 守护路径一律强制新检测，不复用缓存 */
export async function recheckAndApply(_force = true): Promise<CheckState> {
  const cs = await ensureCheck(true);
  await serialize(() => recomputeFromCheck(cs, true));
  return cs;
}

export async function onSitesChanged(): Promise<void> {
  // 规则变更后先锁再强制验，避免旧 ok 直接放行新规则
  await serialize(async () => {
    const sites = await loadSites();
    const prev = await getGuardStates();
    const now = Date.now();
    const states: Record<string, GuardState> = {};
    for (const site of sites.filter((s) => s.enabled)) {
      const p = prev[site.id];
      if (p?.status === 'bypass' && p.bypassUntil && p.bypassUntil > now) {
        states[site.id] = p;
      } else {
        states[site.id] = {
          siteId: site.id,
          status: 'checking',
          reason: '规则已更新，重新验证',
          updatedAt: now,
        };
      }
    }
    await _setAll(sites, states);
  });
  await recheckAndApply(true);
}

export async function forceAllowSite(siteId: string, minutes: number): Promise<void> {
  await serialize(async () => {
    const [sites, prev] = await Promise.all([loadSites(), getGuardStates()]);
    const site = sites.find((s) => s.id === siteId && s.enabled);
    if (!site) throw new Error('站点不存在或未启用');
    const now = Date.now();
    const until = now + minutes * 60_000;
    const states = { ...prev };
    states[siteId] = {
      siteId,
      status: 'bypass',
      reason: '用户强行放行',
      bypassUntil: until,
      updatedAt: now,
    };
    await _setAll(sites, states);
    chrome.alarms.create(`${ALARM_BYPASS_PREFIX}${siteId}`, { when: until });
  });
}

export async function pauseAll(minutes: number): Promise<void> {
  await serialize(async () => {
    const [sites, prev] = await Promise.all([loadSites(), getGuardStates()]);
    const now = Date.now();
    const until = now + minutes * 60_000;
    const states = { ...prev };
    for (const site of sites.filter((s) => s.enabled)) {
      states[site.id] = {
        siteId: site.id,
        status: 'bypass',
        reason: '守护已暂停',
        bypassUntil: until,
        updatedAt: now,
      };
      chrome.alarms.create(`${ALARM_BYPASS_PREFIX}${site.id}`, { when: until });
    }
    await _setAll(sites, states);
  });
}

export async function onBypassExpired(_siteId: string): Promise<void> {
  await recheckAndApply(true);
}

export async function relockAll(): Promise<void> {
  await clearBypassAlarms();
  await serialize(async () => {
    const cur = await getCheckState();
    await recomputeFromCheck(cur, false, true);
  });
  await recheckAndApply(true);
}
