import { describe, expect, it } from 'vitest';
import { buildSiteRules, SUB_RESOURCE_TYPES } from '../src/shared/rules';

describe('buildSiteRules', () => {
  const base = 'chrome-extension://abc/blocked.html';
  const rules = buildSiteRules('site-1', 'chatgpt.com', [1, 2], base);

  it('生成两条规则：主框架重定向 + 子资源阻断', () => {
    expect(rules).toHaveLength(2);
    expect(rules[0].id).toBe(1);
    expect(rules[1].id).toBe(2);
  });

  it('主框架规则重定向到拦截页并携带原始 URL 占位符', () => {
    const r = rules[0];
    expect(r.action.type).toBe('redirect');
    expect(r.action.redirect?.regexSubstitution).toBe(
      `${base}?site=site-1&from=\\0`,
    );
    expect(r.condition.resourceTypes).toEqual(['main_frame']);
    expect(r.condition.requestDomains).toEqual(['chatgpt.com']);
    // regexFilter 必须消费整个 URL，\0 才是完整原始地址
    expect(r.condition.regexFilter).toBe('^https?://.*');
  });

  it('子资源规则为 block 且覆盖除 main_frame 外的类型', () => {
    const r = rules[1];
    expect(r.action.type).toBe('block');
    expect(r.condition.requestDomains).toEqual(['chatgpt.com']);
    expect(r.condition.resourceTypes).toEqual(SUB_RESOURCE_TYPES);
    expect(r.condition.resourceTypes).not.toContain('main_frame');
  });

  it('siteId 会被 URL 编码', () => {
    const r2 = buildSiteRules('a&b', 'x.com', [3, 4], base);
    expect(r2[0].action.redirect?.regexSubstitution).toContain('site=a%26b');
  });

  it('支持注入 excludedTabIds 标签页排除白名单', () => {
    const rWithTabs = buildSiteRules('site-1', 'chatgpt.com', [5, 6], base, [101, 102]);
    expect(rWithTabs[0].condition.excludedTabIds).toEqual([101, 102]);
    expect(rWithTabs[1].condition.excludedTabIds).toEqual([101, 102]);
  });

  it('泛域名规则自动去除通配符生成合规纯域名 requestDomains', () => {
    const rWildcard = buildSiteRules('site-wildcard', '*.google.com', [7, 8], base);
    expect(rWildcard[0].condition.requestDomains).toEqual(['google.com']);
    expect(rWildcard[1].condition.requestDomains).toEqual(['google.com']);
  });
});
