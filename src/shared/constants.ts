import type { CheckerConfig, Settings, TrafficValidationLevel } from './types';

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
  timeWindowMinutes: 60,
  strictToleranceCount: 5,
  strictRecheckMinutes: 5,
  passRedirectDelaySec: 3,
  habitEnabled: true,
  notifySuggestions: true,
  suggestWindowDays: 5,
  suggestMinDays: 3,
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

/**
 * 流量判定校验策略等级元数据（总体按照严格等级，反向排列一二三四：1 时间画像 -> 2 宽松 -> 3 抽样 -> 4 严格）
 */
export const POLICY_LEVELS = [
  {
    level: 1,
    id: 'time_window' as const,
    name: '基于时间画像策略',
    shortName: '时间画像',
    badge: '时间画像 · 极速免检',
    badgeClass: 'tag-ok',
    color: '#10b981',
    securityScore: 2,
    speedScore: 5,
    desc: '在设定的固定时间窗口范围内（默认 60 分钟），对已通过验证的受保护站点免除第二次首屏阻塞校验。由后台静默周期复检间隔和手动检测做兜底验证。',
    scene: '适用场景：仅适用代理 IP 相对固定、追求极致首屏秒开与稳定访问效率的场景。',
  },
  {
    level: 2,
    id: 'relaxed' as const,
    name: '宽松效率模式',
    shortName: '宽松效率',
    badge: '极速流畅 · 开屏首检 (推荐)',
    badgeClass: 'tag-ok',
    color: '#84cc16',
    securityScore: 3,
    speedScore: 5,
    desc: '只对标签页开屏请求（首次主框架导航）进行落地 IP 校验。校验通过后，后续页面内所有交互流量（Fetch/XHR、子资源、单页应用 SPA 路由切换）默认放行。代理连接 100% 极速直通，彻底解决连接迟缓。',
    scene: '适用场景：OpenAI ChatGPT、Claude、密集型 WebApp 及日常大部分网站。',
  },
  {
    level: 3,
    id: 'sampling' as const,
    name: '抽样检测模式',
    shortName: '抽样检测',
    badge: '平衡模式 · 轻量抽检',
    badgeClass: 'tag-warning',
    color: '#f59e0b',
    securityScore: 4,
    speedScore: 4,
    desc: '开屏请求强制校验，通过后放行后续交互流量；对后续请求按频次轻量抽样二次复核。抽检在后台异步比对当前缓存，不提前加锁阻断子资源，仅确认 IP 漂移时才中断访问。',
    scene: '适用场景：兼顾安全与流畅度，适合 Twitter/X、Facebook、海外云平台等常规账号。',
  },
  {
    level: 4,
    id: 'strict' as const,
    name: '严格拦截模式',
    shortName: '严格拦截',
    badge: '最高安全 · 实时强校验',
    badgeClass: 'tag-danger',
    color: '#ef4444',
    securityScore: 5,
    speedScore: 2,
    desc: '开屏、切页与更新均触发实时强校验。单次标签页打开在验证放行通过指定数量（默认 5 条）页内资源后宽容放行后续请求，避免网页整体不可用；并每隔设定分钟（默认 5 分钟）静默复检配合拦截。',
    scene: '适用场景：对异地 IP 变动极度敏感的高危金融、资产与敏感风控平台。',
  },
] as const;

export type PolicyLevelMeta = (typeof POLICY_LEVELS)[number];

export function getPolicyMeta(level?: TrafficValidationLevel): PolicyLevelMeta {
  const target = level || 'relaxed';
  return POLICY_LEVELS.find((p) => p.id === target) || POLICY_LEVELS[1];
}
