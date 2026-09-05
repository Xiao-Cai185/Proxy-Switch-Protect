import { useEffect, useState } from 'react';
import { K, SK } from '../../shared/constants';
import {
  getCheckState,
  getGuardStates,
  loadActiveProfileId,
  loadHabits,
  loadProfileChecks,
  loadProfiles,
  loadSettings,
  loadSites,
  loadSuggestions,
  watchKey,
} from '../../shared/storage';
import type {
  CheckState,
  GuardState,
  HabitStore,
  ProfileCheckResult,
  ProtectedSite,
  ProxyProfile,
  Settings,
  Suggestion,
} from '../../shared/types';

/** 订阅 storage 中某个键：首次加载 + 变更自动刷新 */
function useStorageValue<T>(
  area: 'local' | 'session',
  key: string,
  loader: () => Promise<T>,
): T | undefined {
  const [val, setVal] = useState<T | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void loader().then((v) => {
        if (alive) setVal(v);
      });
    };
    refresh();
    const unsub = watchKey(area, key, refresh);
    return () => {
      alive = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, key]);
  return val;
}

export const useProfiles = (): ProxyProfile[] | undefined =>
  useStorageValue('local', K.profiles, loadProfiles);

export const useProfileChecks = (): Record<string, ProfileCheckResult> | undefined =>
  useStorageValue('local', K.profileChecks, loadProfileChecks);

export const useActiveProfileId = (): string | null | undefined =>
  useStorageValue('local', K.activeProfileId, loadActiveProfileId);

export const useSites = (): ProtectedSite[] | undefined =>
  useStorageValue('local', K.sites, loadSites);

export const useSettings = (): Settings | undefined =>
  useStorageValue('local', K.settings, loadSettings);

export const useHabits = (): HabitStore | undefined =>
  useStorageValue('local', K.habits, loadHabits);

export const useSuggestions = (): Suggestion[] | undefined =>
  useStorageValue('local', K.suggestions, loadSuggestions);

export const useCheckState = (): CheckState | undefined =>
  useStorageValue('session', SK.checkState, getCheckState);

export const useGuardStates = (): Record<string, GuardState> | undefined =>
  useStorageValue('session', SK.guardStates, getGuardStates);
