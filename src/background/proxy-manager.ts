import { BUILTIN_PROFILES, DEFAULT_BYPASS } from '../shared/constants';
import { loadActiveProfileId, loadProfiles, saveActiveProfileId } from '../shared/storage';
import type { ProxyProfile } from '../shared/types';

/* ---------- chrome.proxy 促成器（callback -> Promise） ---------- */

function proxySet(value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value: value as chrome.proxy.ProxyConfig, scope: 'regular' }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function proxyClear(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.clear({ scope: 'regular' }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

export function getLevelOfControl(): Promise<{ levelOfControl: string; controlled: boolean }> {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.get({}, (details) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      const level = details.levelOfControl;
      resolve({
        levelOfControl: level,
        controlled:
          level === 'controlled_by_this_extension' ||
          level === 'controllable_by_this_extension',
      });
    });
  });
}

/* ---------- 档案应用 ---------- */

export function isBuiltinProfile(id: string): boolean {
  return BUILTIN_PROFILES.some((b) => b.id === id);
}

function buildFixedConfig(p: ProxyProfile): unknown {
  return {
    mode: 'fixed_servers',
    rules: {
      singleProxy: { scheme: p.scheme, host: p.host, port: p.port },
      bypassList: p.bypassList.length > 0 ? p.bypassList : DEFAULT_BYPASS,
    },
  };
}

/**
 * 应用代理档案（builtin: direct/system 或用户档案 id）。
 * 仅负责代理设置本身；锁定与复检由 GuardEngine 编排。
 */
export async function applyProfileById(profileId: string): Promise<void> {
  if (profileId === 'direct') {
    await proxySet({ mode: 'direct' });
  } else if (profileId === 'system') {
    // 交还控制权，跟随系统 / 其他程序
    await proxyClear();
  } else {
    const profiles = await loadProfiles();
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error('代理档案不存在');
    await proxySet(buildFixedConfig(profile));
  }
  await saveActiveProfileId(profileId);
}

/** 当前激活档案发生内容变更（如改了 host）时重新应用 */
export async function reapplyActiveProfile(): Promise<boolean> {
  const activeId = await loadActiveProfileId();
  if (!activeId || isBuiltinProfile(activeId)) return false;
  const profiles = await loadProfiles();
  const profile = profiles.find((p) => p.id === activeId);
  if (!profile) {
    // 激活档案被删除，退回直连
    await applyProfileById('direct');
    return true;
  }
  await proxySet(buildFixedConfig(profile));
  return true;
}

/* ---------- HTTP(S) 代理认证 ---------- */

const authAttempts = new Map<string, number>();

export function initAuthListener(): void {
  chrome.webRequest.onAuthRequired.addListener(
    (details, asyncCallback) => {
      void (async () => {
        try {
          if (!details.isProxy) return asyncCallback?.({});
          const [profiles, activeId] = await Promise.all([
            loadProfiles(),
            loadActiveProfileId(),
          ]);
          const p = profiles.find((x) => x.id === activeId);
          if (!p?.auth || (p.scheme !== 'http' && p.scheme !== 'https')) {
            return asyncCallback?.({});
          }
          if (authAttempts.size > 500) authAttempts.clear();
          const n = (authAttempts.get(details.requestId) ?? 0) + 1;
          authAttempts.set(details.requestId, n);
          // 凭据错误时浏览器会反复询问，避免死循环
          if (n > 2) return asyncCallback?.({ cancel: true });
          asyncCallback?.({
            authCredentials: {
              username: p.auth.username,
              password: p.auth.password,
            },
          });
        } catch {
          asyncCallback?.({});
        }
      })();
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking'],
  );
}
