/**
 * declarativeNetRequest 动态规则生成（纯函数，便于测试）。
 *
 * 每个锁定中的守护站点对应两条规则：
 * 1. main_frame 导航 -> 重定向到拦截页（携带 siteId 与原始 URL）
 * 2. 其余子资源（iframe/xhr/ws 等）-> 直接阻断
 *
 * requestDomains 自带"含子域"语义且按域边界匹配（不会误伤 notchatgpt.com）。
 */

export interface DnrRuleJson {
  id: number;
  priority: number;
  action: {
    type: 'redirect' | 'block';
    redirect?: { regexSubstitution: string };
  };
  condition: {
    regexFilter?: string;
    requestDomains?: string[];
    resourceTypes: string[];
    excludedTabIds?: number[];
  };
}

/** 除 main_frame 外的全部资源类型 */
export const SUB_RESOURCE_TYPES = [
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
];

/**
 * 生成某站点处于锁定态时的两条 DNR 规则。
 * @param blockedBaseUrl 拦截页完整 URL（chrome.runtime.getURL('blocked.html')）
 * @param ids [重定向规则id, 阻断规则id]
 * @param excludedTabIds 排除匹配的放行标签页 ID 列表（Chromium Session 规则专用）
 */
export function buildSiteRules(
  siteId: string,
  domain: string,
  ids: [number, number],
  blockedBaseUrl: string,
  excludedTabIds?: number[],
): DnrRuleJson[] {
  // Chrome DNR requestDomains 原生支持域名及其全部子域名匹配，但要求传纯域名（不得带 * 或前导点）
  const dnrDomain = domain.replace(/^\*\./, '').replace(/^\./, '').replace(/\.$/, '').toLowerCase();
  const condBase: {
    requestDomains: string[];
    excludedTabIds?: number[];
  } = {
    requestDomains: [dnrDomain],
  };
  if (excludedTabIds && excludedTabIds.length > 0) {
    condBase.excludedTabIds = excludedTabIds;
  }

  return [
    {
      id: ids[0],
      priority: 1,
      action: {
        type: 'redirect',
        // \0 为 regexFilter 命中的完整 URL，作为最后一个参数原样携带
        redirect: {
          regexSubstitution: `${blockedBaseUrl}?site=${encodeURIComponent(siteId)}&from=\\0`,
        },
      },
      condition: {
        ...condBase,
        regexFilter: '^https?://.*',
        resourceTypes: ['main_frame'],
      },
    },
    {
      id: ids[1],
      priority: 1,
      action: { type: 'block' },
      condition: {
        ...condBase,
        resourceTypes: SUB_RESOURCE_TYPES,
      },
    },
  ];
}
