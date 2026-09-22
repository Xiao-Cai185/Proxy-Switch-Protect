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
import type { CheckState, GuardState, ProtectedSite, Settings } from '../shared/types';
import { activeKeyOf, ensureCheck } from './ip-checker';
import {
  clearAllTabSessions,
  clearSiteVerifications,
  getExcludedTabIdsForSite,
  isCheckStateMatching,
  isSiteWithinTimeWindow,
  isTabSessionVerified,
  markTabVerified,
  recordSiteVerification,
  removeSiteVerification,
  removeTabSession,
  resolveEffectiveLevel,
} from './traffic-policy';

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

/* ---------- declarativeNetRequest (Session Rules + 白名单排除) ---------- */

function dnrGetSessionRules(): Promise<chrome.declarativeNetRequest.Rule[]> {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.getSessionRules((rules) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(rules);
    });
  });
}

function dnrUpdateSessionRules(
  options: chrome.declarativeNetRequest.UpdateRuleOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.updateSessionRules(options, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

/** 清理历史残留的动态规则，确保全链路迁移至 session rules */
async function dnrClearLegacyDynamicRules(): Promise<void> {
  return new Promise((resolve) => {
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
      if (chrome.runtime.lastError || !rules || rules.length === 0) {
        resolve();
        return;
      }
      chrome.declarativeNetRequest.updateDynamicRules(
        { removeRuleIds: rules.map((r) => r.id) },
        () => resolve(),
      );
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
  const [settings, activeId] = await Promise.all([loadSettings(), loadActiveProfileId()]);
  const activeKey = activeKeyOf(activeId);

  for (const site of sites) {
    if (!site.enabled) continue;
    const st = states[site.id];
    // 用户临时主动 bypass（如强行放行15分钟或暂停守护）：暂不应用阻断规则
    if (st && st.status === 'bypass') {
      continue;
    }

    const level = resolveEffectiveLevel(site, settings);

    // 第 1 等级：基于时间画像策略
    // 若状态为 allowed 且在免检时间窗口内，无需下发任何 DNR 拦截规则，所有新建标签页秒开直通
    if (level === 'time_window' && st && st.status === 'allowed') {
      const withinWindow = await isSiteWithinTimeWindow(
        site.id,
        activeKey,
        settings.timeWindowMinutes ?? 60,
      );
      if (withinWindow) {
        continue;
      }
    }

    // 第 2 等级（宽松）、第 3 等级（抽样）与第 4 等级（严格）：
    // 状态为 allowed 时，底层规则依然常驻，仅将已通过开屏验证的 tabIds 填入 excludedTabIds。
    // 这样新开的标签页（未在 tabs 白名单中）均会触发开屏检测并进入拦截校验，完成验证后放行！
    let excluded: number[] | undefined;
    if (st && st.status === 'allowed') {
      const tabs = await getExcludedTabIdsForSite(site.id);
      if (tabs.length > 0) {
        excluded = tabs;
      }
    }

    rules.push(
      ...buildSiteRules(
        site.id,
        site.domainPattern,
        [id++, id++],
        blockedBase(),
        excluded,
      ),
    );
  }

  const existing = await dnrGetSessionRules();
  await dnrUpdateSessionRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: rules as unknown as chrome.declarativeNetRequest.Rule[],
  });
  await dnrClearLegacyDynamicRules();
  await setGuardStates(states);
}

/** 刷新全部 DNR 规则与白名单排除标签页 */
export async function syncDnrRules(): Promise<void> {
  await serialize(async () => {
    const [sites, states] = await Promise.all([loadSites(), getGuardStates()]);
    await _setAll(sites, states);
  });
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

      if (isPass) {
        await recordSiteVerification(site.id, activeKey);
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
  if (newlyLocked.length > 0) {
    await clearAllTabSessions();
    for (const { site } of newlyLocked) {
      await removeSiteVerification(site.id);
    }
  }
  await updateBadge().catch(() => undefined);
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
 * 支持三种流量策略：
 * 1. strict（严格模式）：开屏/切页/更新均强制锁屏加检，不复用旧结果。
 * 2. sampling（抽样模式）：开屏必检，若已通过开屏校验则放行后续交互（由 webRequest 抽样触发平滑二次校验）。
 * 3. relaxed（宽松效率模式）：只对开屏请求校验，校验通过后后续页面内交互直接放行。
 */
export async function onProtectedAccess(url: string, tabId?: number): Promise<void> {
  const [sites, settings] = await Promise.all([loadSites(), loadSettings()]);
  const hits = matchingSites(url, sites);
  if (hits.length === 0) return;

  // 1. 如果带有有效 tabId，先判定是否已在对应模式下通过开屏验证
  if (typeof tabId === 'number' && tabId > 0) {
    let allSessionsValid = true;
    for (const site of hits) {
      const isVerified = await isTabSessionVerified(tabId, site.id);
      if (!isVerified) {
        allSessionsValid = false;
        break;
      }
    }
    // 若命中站点的会话均已获放行许可，后续页面内交互流量直接放行！
    if (allSessionsValid) {
      return;
    }
  }

  // 2. 针对开屏请求，检查第四等级（time_window）以及 sampling 与 relaxed 模式
  const cs = await getCheckState();
  const activeKey = activeKeyOf(await loadActiveProfileId());
  const webrtcProtect = settings.webrtcProtect !== false;
  const prevStates = await getGuardStates();

  if (typeof tabId === 'number' && tabId > 0) {
    let canDirectAllow = true;
    for (const site of hits) {
      const level = resolveEffectiveLevel(site, settings);
      if (level === 'strict') {
        canDirectAllow = false;
        break;
      }
      if (level === 'time_window') {
        const withinWindow = await isSiteWithinTimeWindow(
          site.id,
          activeKey,
          settings.timeWindowMinutes ?? 60,
        );
        const isExplicitLocked = prevStates[site.id]?.status === 'locked';
        if (!withinWindow || isExplicitLocked) {
          canDirectAllow = false;
          break;
        }
        continue;
      }
      // 对于第 2 (relaxed)、第 3 (sampling) 与第 4 (strict) 等级：
      // 新建标签页必须通过开屏检测，尚未在放行白名单中的标签页绝不在此处静默直接放行
      const tabVerified = await isTabSessionVerified(tabId, site.id);
      if (!tabVerified) {
        canDirectAllow = false;
        break;
      }
      const siteAllowed =
        prevStates[site.id]?.status === 'allowed' || prevStates[site.id]?.status === 'bypass';
      const checkValid = isCheckStateMatching(site, cs, activeKey, webrtcProtect);
      if (!siteAllowed || !checkValid) {
        canDirectAllow = false;
        break;
      }
    }

    if (canDirectAllow) {
      let stateChanged = false;
      const states = { ...prevStates };
      for (const site of hits) {
        await markTabVerified(tabId, site.id, site.domainPattern);
        await recordSiteVerification(site.id, activeKey);
        if (states[site.id]?.status !== 'allowed' && states[site.id]?.status !== 'bypass') {
          states[site.id] = { siteId: site.id, status: 'allowed', updatedAt: Date.now() };
          stateChanged = true;
        }
      }
      if (stateChanged) {
        await _setAll(sites, states);
      } else {
        await syncDnrRules();
      }
      return;
    }
  }

  // 3. 严格模式或未就绪的开屏请求：加锁并强制执行验证
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

  const nextCs = await recheckAndApply(true);

  // 4. 验证完成后，若放行且有 tabId，记录开屏放行会话并同步放行白名单
  if (typeof tabId === 'number' && tabId > 0 && nextCs.status === 'ok') {
    const currentStates = await getGuardStates();
    for (const site of hits) {
      if (
        currentStates[site.id]?.status === 'allowed' ||
        currentStates[site.id]?.status === 'bypass'
      ) {
        await markTabVerified(tabId, site.id, site.domainPattern);
        await recordSiteVerification(site.id, activeKey);
      }
    }
    await syncDnrRules();
  }
}

/**
 * 同步更新右上角 Action Badge 徽标与扩展图标：
 * - 缺省托管状态（未选择代理节点，!activeId）：图标切换为橙色盾牌 (icons/icon*-orange.png)，Badge 呈现橙色
 * - 激活代理节点后：图标恢复为蓝色盾牌 (icons/icon*.png)，Badge 恢复正常红绿状态
 */
export async function updateBadge(): Promise<void> {
  const [cs, gs, activeId] = await Promise.all([
    getCheckState(),
    getGuardStates(),
    loadActiveProfileId(),
  ]);

  const isDefaultManaged = !activeId;
  const iconSuffix = isDefaultManaged ? '-orange.png' : '.png';
  try {
    await chrome.action.setIcon({
      path: {
        16: `icons/icon16${iconSuffix}`,
        32: `icons/icon32${iconSuffix}`,
        48: `icons/icon48${iconSuffix}`,
        128: `icons/icon128${iconSuffix}`,
      },
    });
  } catch {
    // ignore
  }

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
    if (isDefaultManaged) {
      color = '#ea580c'; // 缺省托管状态展示醒目橙色
    } else {
      color = anyLocked ? '#ea580c' : mismatch ? '#d97706' : '#16a34a';
    }
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

/**
 * 针对指定标签页核验并放行：
 * 逻辑遵循：
 * 1. 开屏检测：执行强制实时新探测（获取真实出口 IP、国家与 WebRTC 状态）；
 * 2. 规则生效：根据最新探测结果通过 recomputeFromCheck 重算站点状态，更新 Session 规则；
 * 3. 结果同步：实时同步更新右上角插件 Action Badge 的红绿状态与国家标识；
 * 4. 判定放行：若最新判定合规，则将该标签页加入白名单（excludedTabIds）并允许放行；
 *    若不合规，绝不放行，停留在拦截页并反馈最新原因。
 */
export async function verifyAndAuthorizeTab(
  siteId: string,
  tabId: number,
): Promise<{ pass: boolean; reason?: string }> {
  if (tabId <= 0) return { pass: false, reason: '无效的标签页 ID' };

  const [sites, prevStates, settings, activeId, cs] = await Promise.all([
    loadSites(),
    getGuardStates(),
    loadSettings(),
    loadActiveProfileId(),
    getCheckState(),
  ]);
  const site = sites.find((s) => s.id === siteId && s.enabled);
  if (!site) return { pass: false, reason: '站点未启用或规则不存在' };

  const activeKey = activeKeyOf(activeId);
  const level = resolveEffectiveLevel(site, settings);

  // 1. 若为第 1 等级（时间画像），检查是否处于免检时间窗口内且未被显式锁定
  if (level === 'time_window') {
    const withinWindow = await isSiteWithinTimeWindow(
      site.id,
      activeKey,
      settings.timeWindowMinutes ?? 60,
    );
    if (withinWindow && prevStates[site.id]?.status !== 'locked') {
      await markTabVerified(tabId, site.id, site.domainPattern);
      const states = { ...prevStates };
      states[site.id] = { siteId: site.id, status: 'allowed', updatedAt: Date.now() };
      await _setAll(sites, states);
      await updateBadge().catch(() => undefined);
      return { pass: true };
    }
  }

  // 2. 检查当前 checkState 是否新鲜且符合站点期望（非 strict 模式直接免探测快速放行）
  const webrtcProtect = settings.webrtcProtect !== false;
  if (level !== 'strict' && isCheckStateMatching(site, cs, activeKey, webrtcProtect)) {
    await markTabVerified(tabId, site.id, site.domainPattern);
    await recordSiteVerification(site.id, activeKey);
    const states = { ...prevStates };
    states[site.id] = { siteId: site.id, status: 'allowed', updatedAt: Date.now() };
    await _setAll(sites, states);
    await updateBadge().catch(() => undefined);
    return { pass: true };
  }

  // 3. 严格模式或未就绪：执行开屏强制新探测
  await recheckAndApply(true);
  await updateBadge().catch(() => undefined);

  // 4. 读取该站点最新的判定结果
  const updatedStates = await getGuardStates();
  const st = updatedStates[site.id];
  const isPass = st?.status === 'allowed' || st?.status === 'bypass';

  if (isPass) {
    // 校验通过：将该标签页加入放行白名单并同步刷新 Session 规则
    await markTabVerified(tabId, site.id, site.domainPattern);
    await recordSiteVerification(site.id, activeKey);
    await syncDnrRules();
    return { pass: true };
  }

  // 校验未通过：保持阻断，返回具体违规原因
  return { pass: false, reason: st?.reason || '未达到安全放行要求' };
}

/**
 * 抽样检测二级复核：
 * 针对 Level 2（抽样模式）后续交互流量，异步后台比对当前 IP 是否依然合规。
 * 不在检测前盲目阻断子资源；仅在检测确认违规时才触发锁定。
 */
export async function triggerSamplingCheck(siteId: string): Promise<void> {
  const [sites, settings, activeId] = await Promise.all([
    loadSites(),
    loadSettings(),
    loadActiveProfileId(),
  ]);
  const site = sites.find((s) => s.id === siteId && s.enabled);
  if (!site) return;

  const cs = await getCheckState();
  const activeKey = activeKeyOf(activeId);
  const webrtcProtect = settings.webrtcProtect !== false;

  // 若当前已有新鲜有效的结果且匹配，平滑放行
  if (isCheckStateMatching(site, cs, activeKey, webrtcProtect)) {
    return;
  }

  // 否则后台发起静默复检
  try {
    const newCs = await ensureCheck(true);
    if (!isCheckStateMatching(site, newCs, activeKey, webrtcProtect)) {
      await clearAllTabSessions();
      await lockAndRecheck('抽样复检发现落地 IP 漂移或未满足安全策略');
    }
  } catch {
    await clearAllTabSessions();
    await lockAndRecheck('抽样复检无法确认落地 IP，已中断访问');
  }
}

/**
 * 严格模式周期复检：
 * 单标签页验证通过特定条数页内资源放行后，每隔设定分钟（默认 5 分钟）静默探测出口 IP；
 * 若检测到 IP 漂移或规则不满足，立即撤销放行并触发锁屏拦截。
 */
export async function triggerStrictPeriodicRecheck(siteId: string, tabId: number): Promise<void> {
  const [sites, settings, activeId] = await Promise.all([
    loadSites(),
    loadSettings(),
    loadActiveProfileId(),
  ]);
  const site = sites.find((s) => s.id === siteId && s.enabled);
  if (!site) return;

  const activeKey = activeKeyOf(activeId);
  const webrtcProtect = settings.webrtcProtect !== false;

  try {
    const cs = await ensureCheck(true);
    const pass = isCheckStateMatching(site, cs, activeKey, webrtcProtect);
    if (!pass) {
      await removeTabSession(tabId);
      await clearAllTabSessions();
      await clearSiteVerifications();
      await lockAndRecheck(
        `严格模式周期复检发现落地 IP 异常（当前 ${cs.result?.countryCode || '未知'} / ${
          cs.result?.ip || '未知'
        }），已阻断拦截`,
      );
    }
  } catch {
    await removeTabSession(tabId);
    await clearAllTabSessions();
    await clearSiteVerifications();
    await lockAndRecheck('严格模式周期复检无法确认落地 IP，为安全起见已阻断拦截');
  }
}

/** SW / 浏览器启动：默认全锁，再强制验 IP（若处于有效 time_window 免检窗口期内，保护放行状态不被锁死） */
export async function initGuard(): Promise<void> {
  await clearAllTabSessions();
  await serialize(async () => {
    const [sites, prev, settings, activeId] = await Promise.all([
      loadSites(),
      getGuardStates(),
      loadSettings(),
      loadActiveProfileId(),
    ]);
    const activeKey = activeKeyOf(activeId);
    const now = Date.now();
    const states: Record<string, GuardState> = { ...prev };
    for (const site of sites.filter((s) => s.enabled)) {
      const p = prev[site.id];
      if (p?.status === 'bypass' && p.bypassUntil && p.bypassUntil > now) {
        continue;
      }
      const level = resolveEffectiveLevel(site, settings);
      if (level === 'time_window') {
        const withinWindow = await isSiteWithinTimeWindow(
          site.id,
          activeKey,
          settings.timeWindowMinutes ?? 60,
        );
        if (withinWindow && p?.status !== 'locked') {
          states[site.id] = { siteId: site.id, status: 'allowed', updatedAt: now };
          continue;
        }
      }
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
  await clearAllTabSessions();
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

/**
 * 策略配置项变更响应：
 * 当切换 1~4 策略等级或调整时间窗口、抽样/严格模式参数时，
 * 彻底清除时间画像与标签页会话白名单，重置护航状态，杜绝任何黏连耦合，
 * 确保换到 2/3/4 等级后即刻生效，重新触发开屏检测！
 */
export async function onSettingsChanged(
  oldSettings?: Settings,
  newSettings?: Settings,
): Promise<void> {
  const levelChanged =
    oldSettings?.trafficValidationLevel !== newSettings?.trafficValidationLevel;
  const timeWindowChanged =
    oldSettings?.timeWindowMinutes !== newSettings?.timeWindowMinutes;
  const strictToleranceChanged =
    oldSettings?.strictToleranceCount !== newSettings?.strictToleranceCount;
  const strictRecheckChanged =
    oldSettings?.strictRecheckMinutes !== newSettings?.strictRecheckMinutes;

  if (levelChanged || timeWindowChanged || strictToleranceChanged || strictRecheckChanged) {
    await clearAllTabSessions();
    await clearSiteVerifications();

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
            reason: '策略等级已调整，重新开屏校验',
            updatedAt: now,
          };
        }
      }
      await _setAll(sites, states);
    });

    await recheckAndApply(true);
  }
}

export async function onSitesChanged(): Promise<void> {
  await clearAllTabSessions();
  await clearSiteVerifications();
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
  await clearAllTabSessions();
  await clearSiteVerifications();
  await serialize(async () => {
    const cur = await getCheckState();
    await recomputeFromCheck(cur, false, true);
  });
  await recheckAndApply(true);
}
