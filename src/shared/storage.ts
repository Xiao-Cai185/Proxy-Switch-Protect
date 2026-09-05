import { K, SK, DEFAULT_SETTINGS } from './constants';
import type {
  CheckState,
  GuardState,
  HabitStore,
  ProfileCheckResult,
  ProtectedSite,
  ProxyProfile,
  Settings,
  Suggestion,
} from './types';

type Area = chrome.storage.StorageArea;

function areaGet<T>(area: Area, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    area.get(key, (items) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve((items as Record<string, T>)[key]);
    });
  });
}

function areaSet(area: Area, items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    area.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

export async function getLocal<T>(key: string, fallback: T): Promise<T> {
  const v = await areaGet<T>(chrome.storage.local, key);
  return v === undefined ? fallback : v;
}
export function setLocal(key: string, value: unknown): Promise<void> {
  return areaSet(chrome.storage.local, { [key]: value });
}
export async function getSession<T>(key: string, fallback: T): Promise<T> {
  const v = await areaGet<T>(chrome.storage.session, key);
  return v === undefined ? fallback : v;
}
export function setSession(key: string, value: unknown): Promise<void> {
  return areaSet(chrome.storage.session, { [key]: value });
}

/* ---------- 类型化访问器 ---------- */

export const loadProfiles = () => getLocal<ProxyProfile[]>(K.profiles, []);
export const saveProfiles = (v: ProxyProfile[]) => setLocal(K.profiles, v);

export const loadProfileChecks = () =>
  getLocal<Record<string, ProfileCheckResult>>(K.profileChecks, {});
export const saveProfileChecks = (v: Record<string, ProfileCheckResult>) =>
  setLocal(K.profileChecks, v);

export const loadActiveProfileId = () => getLocal<string | null>(K.activeProfileId, null);
export const saveActiveProfileId = (v: string | null) => setLocal(K.activeProfileId, v);

export const loadSites = () => getLocal<ProtectedSite[]>(K.sites, []);
export const saveSites = (v: ProtectedSite[]) => setLocal(K.sites, v);

export async function loadSettings(): Promise<Settings> {
  const v = await getLocal<Partial<Settings>>(K.settings, {});
  const merged: Settings = { ...DEFAULT_SETTINGS, ...v };
  if (!Array.isArray(merged.checkers) || merged.checkers.length === 0) {
    merged.checkers = DEFAULT_SETTINGS.checkers;
  }
  return merged;
}
export const saveSettings = (v: Settings) => setLocal(K.settings, v);

export const loadHabits = () => getLocal<HabitStore>(K.habits, {});
export const saveHabits = (v: HabitStore) => setLocal(K.habits, v);

export const loadSuggestions = () => getLocal<Suggestion[]>(K.suggestions, []);
export const saveSuggestions = (v: Suggestion[]) => setLocal(K.suggestions, v);

export const loadDismissed = () => getLocal<string[]>(K.dismissed, []);
export const saveDismissed = (v: string[]) => setLocal(K.dismissed, v);

export const getCheckState = () =>
  getSession<CheckState>(SK.checkState, { status: 'idle', updatedAt: 0 });
export const setCheckState = (v: CheckState) => setSession(SK.checkState, v);

export const getGuardStates = () =>
  getSession<Record<string, GuardState>>(SK.guardStates, {});
export const setGuardStates = (v: Record<string, GuardState>) => setSession(SK.guardStates, v);

/** siteId -> [主框架重定向规则id, 子资源阻断规则id] */
export const getRuleIdMap = () => getLocal<Record<string, [number, number]>>(K.ruleIdMap, {});
export const setRuleIdMap = (v: Record<string, [number, number]>) => setLocal(K.ruleIdMap, v);

export async function allocRuleIds(count: number): Promise<number[]> {
  const next = await getLocal<number>(K.nextRuleId, 1);
  const ids = Array.from({ length: count }, (_, i) => next + i);
  await setLocal(K.nextRuleId, next + count);
  return ids;
}

/* ---------- 变更订阅（供页面响应式刷新） ---------- */

export function watchKey<T>(
  areaName: 'local' | 'session',
  key: string,
  cb: (value: T | undefined) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === areaName && key in changes) cb(changes[key].newValue as T | undefined);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
