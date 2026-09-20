import type { CheckerConfig, Settings } from './types';

/** chrome.storage.local 键名 */
export const K = {
  profiles: 'profiles',
  activeProfileId: 'activeProfileId',
  sites: 'sites',
  settings: 'settings',
  habits: 'habits',
  suggestions: 'suggestions',
  dismissed: 'dismissedSuggestions',
  ruleIdMap: 'ruleIdMap',
  nextRuleId: 'nextRuleId',
  profileChecks: 'profileChecks',
  schemaVersion: 'schemaVersion',
} as const;

/** chrome.storage.session 键名 */
export const SK = {
  checkState: 'checkState',
  guardStates: 'guardStates',
  tabSessions: 'tabSessions',
} as const;

export const SCHEMA_VERSION = 1;

/** 内置落地 IP 检测源（均为 HTTPS，串行降级） */
export const DEFAULT_CHECKERS: CheckerConfig[] = [
  {
    id: 'ipsb',
    name: 'IP.SB',
    url: 'https://api.ip.sb/geoip',
    ipPath: 'ip',
    countryPath: 'country_code',
    cityPath: 'city',
    ispPath: 'isp',
    enabled: true,
    builtin: true,
  },
  {
    id: 'ipwhois',
    name: 'ipwho.is',
    url: 'https://ipwho.is/',
    ipPath: 'ip',
    countryPath: 'country_code',
    cityPath: 'city',
    ispPath: 'connection.isp',
    enabled: true,
    builtin: true,
  },
  {
    id: 'freeipapi',
    name: 'FreeIPAPI',
    url: 'https://freeipapi.com/api/json',
    ipPath: 'ipAddress',
    countryPath: 'countryCode',
    cityPath: 'cityName',
    enabled: true,
    builtin: true,
  },
  {
    id: 'countryis',
    name: 'Country.is',
    url: 'https://api.country.is/',
    ipPath: 'ip',
    countryPath: 'country',
    enabled: true,
    builtin: true,
  },
];

export const DEFAULT_SETTINGS: Settings = {
  checkers: DEFAULT_CHECKERS,
  timeoutMs: 5000,
  recheckMinutes: 30,
  webrtcProtect: true,
  trafficValidationLevel: 'relaxed',
  habitEnabled: true,
  notifySuggestions: true,
  suggestWindowDays: 14,
  suggestMinDays: 5,
  suggestRatio: 0.9,
};

/** 内置代理档案 */
export const BUILTIN_PROFILES: { id: string; name: string; desc: string }[] = [
  { id: 'direct', name: '直连', desc: '不使用任何代理' },
  { id: 'system', name: '系统代理', desc: '跟随系统 / 其他程序设置' },
];

export const DEFAULT_BYPASS = ['localhost', '127.0.0.1', '<local>'];

export const PROFILE_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#baa5fd',
  '#06b6d4',
  '#ec4899',
  '#64748b',
];

/** 检测结果多久内视为"新鲜"（习惯统计的前提） */
export const FRESH_RESULT_MS = 30 * 60 * 1000;

/** 强行放行默认时长（分钟） */
export const DEFAULT_BYPASS_MINUTES = 10;

/** 习惯记录保留天数 */
export const HABIT_RETENTION_DAYS = 90;

/** 报警器名称 */
export const ALARM_RECHECK = 'recheck';
export const ALARM_BYPASS_PREFIX = 'bypass:';
