/** 上游代理协议 */
export type ProxyScheme = 'http' | 'https' | 'socks4' | 'socks5';

/** 代理档案单次落地探测历史结果 */
export interface ProfileCheckResult {
  countryCode: string;
  ip: string;
  city?: string;
  isp?: string;
  checkedAt: number;
  /** 探测往返延迟（毫秒） */
  rttMs?: number;
  /** 是否存在内外分流（非全局代理，境内外流量出口不一致） */
  isSplitTunnel?: boolean;
  /** 境内探针返回的 IP */
  domesticIp?: string;
}

/** 用户配置的代理档案 */
export interface ProxyProfile {
  id: string;
  name: string;
  color: string;
  /** 客户端软件预设图标：'v2ray' | 'clash' | 自定义 */
  icon?: string;
  scheme: ProxyScheme;
  host: string;
  port: number;
  /** 认证信息：仅 HTTP/HTTPS 代理生效（Chromium 不支持带认证的 SOCKS） */
  auth?: { username: string; password: string };
  bypassList: string[];
  /** 最近一次探测落地的出口结果（跟随时钟与探测周期同步） */
  lastCheck?: ProfileCheckResult;
}

/** 内置档案 id：直连 / 系统代理 */
export type BuiltinProfileId = 'direct' | 'system';

/** 站点记事本 */
export interface SiteNote {
  email?: string;
  alias?: string;
  /** 该账号习惯使用的落地国家/地区（ISO 3166-1 alpha-2） */
  regions?: string[];
  text?: string;
  updatedAt: number;
}

/** 受守护站点规则 */
export interface ProtectedSite {
  id: string;
  /** 规范化域名（不含协议/端口/通配符），自动匹配全部子域 */
  domainPattern: string;
  /** 期望落地国家（ISO 3166-1 alpha-2），任一匹配即可 */
  expectedCountries: string[];
  /** 可选：期望出口 IP 段（IPv4 CIDR） */
  expectedIpRanges: string[];
  /** any：国家或 IP 段任一匹配即放行；all：全部维度都需匹配 */
  matchMode: 'any' | 'all';
  enabled: boolean;
  note?: SiteNote;
  /** 站点级流量校验策略（可选，未设置或为 'default' 时跟随全局设置） */
  validationLevel?: TrafficValidationLevel | 'default';
  createdAt: number;
  updatedAt: number;
}

/** 落地 IP 检测源配置 */
export interface CheckerConfig {
  id: string;
  name: string;
  url: string;
  /** JSON 取值路径，如 "ip" 或 "connection.isp" */
  ipPath: string;
  countryPath: string;
  cityPath?: string;
  ispPath?: string;
  enabled: boolean;
  /** 是否内置源（内置源不可删除，可停用） */
  builtin?: boolean;
}

/**
 * 流量判定校验策略等级：
 * - 'strict': 最高等级（严格模式），开屏与切页实时强校验，单次标签页验证通过特定条数页内资源后宽容放行，并按设定周期静默复检
 * - 'sampling': 第二等级（抽样检测），开屏首检必查，后续页面内交互按频率抽样二次复核，抽检时优先比对有效缓存
 * - 'relaxed': 第三等级（宽松效率模式），只对标签页开屏请求进行校验，校验通过后默认信任并放行后续页面内所有交互流量
 * - 'time_window': 第四等级（基于时间画像策略），在固定时间窗口内免除第二次首屏 IP 验证，由后台静默周期复检和手动检测做兜底验证
 */
export type TrafficValidationLevel = 'strict' | 'sampling' | 'relaxed' | 'time_window';

/** 全局设置 */
export interface Settings {
  checkers: CheckerConfig[];
  /** 单个检测源超时（毫秒） */
  timeoutMs: number;
  /** 周期性复检间隔（分钟），0 = 关闭 */
  recheckMinutes: number;
  /**
   * WebRTC Protect：禁用非代理 UDP（disable_non_proxied_udp），
   * 降低 STUN/ICE 真实源 IP 泄漏风险（不是 UDP 代理）。
   */
  webrtcProtect: boolean;
  /** 全局流量判定校验策略等级 */
  trafficValidationLevel?: TrafficValidationLevel;
  /**
   * 基于时间画像策略的免检时间窗口（分钟）。
   * 在此窗口期内访问同一站点不再触发第二次首屏加锁验证，默认 60 分钟。
   */
  timeWindowMinutes?: number;
  /**
   * 严格模式下，单次标签页打开验证放行过的页内资源阈值（条数）。
   * 验证达到该数量后对后续资源放行，避免网页整体不可用，默认 5 条。
   */
  strictToleranceCount?: number;
  /**
   * 严格模式下，页内放行后的周期复检间隔（分钟）。
   * 默认每隔 5 分钟触发一次静默复检，若发现 IP 漂移则执行阻断拦截。
   */
  strictRecheckMinutes?: number;
  /**
   * 安全检测通过后，落地页自动返回目标网站的等待延迟时长（秒）。
   * 默认 3 秒。
   */
  passRedirectDelaySec?: number;
  /** 是否启用使用习惯统计 */
  habitEnabled: boolean;
  /** 是否弹出绑定建议通知 */
  notifySuggestions: boolean;
  suggestWindowDays: number;
  suggestMinDays: number;
  suggestRatio: number;
}

/** 一次成功的落地 IP 检测结果（双栈） */
export interface ExitIpResult {
  /** 主展示 / 规则匹配用 IP（优先 IPv4） */
  ip: string;
  ipv4?: string;
  ipv6?: string;
  /** 地理归属以 IPv4 为准；无 V4 时回退 V6 */
  countryCode: string;
  ipv4CountryCode?: string;
  ipv6CountryCode?: string;
  /** V4 与 V6 国家代码不一致时为 true */
  stackMismatch?: boolean;
  city?: string;
  isp?: string;
  /** 来源检测源名称 */
  source: string;
  checkedAt: number;
  /** 检测时的代理档案指纹，换代理后结果即失效 */
  profileId: string;
  /** 探测往返延迟（毫秒） */
  rttMs?: number;
  /** 是否存在内外分流（非全局代理，境内外流量出口不一致） */
  isSplitTunnel?: boolean;
  /** 境内探针返回的 IP */
  domesticIp?: string;
}

export type CheckStatus = 'idle' | 'checking' | 'ok' | 'error';

/** 当前检测状态（storage.session） */
export interface CheckState {
  status: CheckStatus;
  result?: ExitIpResult;
  error?: string;
  updatedAt: number;
}

export type GuardStatus = 'locked' | 'checking' | 'allowed' | 'bypass';

/** 单个守护站点的运行时状态（storage.session） */
export interface GuardState {
  siteId: string;
  status: GuardStatus;
  /** 锁定原因描述（用于拦截页/弹窗展示） */
  reason?: string;
  /** 强行放行截止时间戳 */
  bypassUntil?: number;
  updatedAt: number;
}

/** 使用习惯：域名 -> 国家 -> 去重后的访问日期（YYYY-MM-DD） */
export type HabitStore = Record<string, Record<string, string[]>>;

/** 绑定建议 */
export interface Suggestion {
  domain: string;
  countryCode: string;
  /** 采样记录时的出口 IP */
  sampleIp?: string;
  /** 窗口期内的访问天数 */
  days: number;
  createdAt: number;
}

/** 导出/导入的数据包 */
export interface ExportBundle {
  schemaVersion: number;
  exportedAt: number;
  profiles: ProxyProfile[];
  sites: ProtectedSite[];
  settings: Settings;
  habits?: HabitStore;
  dismissedSuggestions?: string[];
}
