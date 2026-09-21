import { describe, expect, it } from 'vitest';
import {
  domainMatchesPattern,
  evaluateSite,
  getRegistrableDomain,
  ipInCidr,
  ipToInt,
  normalizeDomain,
  parseCidr,
  urlMatchesDomain,
} from '../src/shared/matchers';

describe('normalizeDomain', () => {
  it('接受纯域名', () => {
    expect(normalizeDomain('chatgpt.com')).toBe('chatgpt.com');
  });
  it('剥离协议、路径、端口', () => {
    expect(normalizeDomain('https://chatgpt.com/c/123?x=1')).toBe('chatgpt.com');
    expect(normalizeDomain('http://example.com:8080/a')).toBe('example.com');
  });
  it('完整支持泛域名规则并规整为 *.domain.tld 格式', () => {
    expect(normalizeDomain('*.ChatGPT.com')).toBe('*.chatgpt.com');
    expect(normalizeDomain('.openai.com')).toBe('*.openai.com');
    expect(normalizeDomain('https://*.api.openai.com/v1')).toBe('*.api.openai.com');
  });
  it('普通域名剥离 www 前缀并小写', () => {
    expect(normalizeDomain('www.openai.com')).toBe('openai.com');
  });
  it('拒绝非法输入', () => {
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('localhost')).toBeNull();
    expect(normalizeDomain('1.2.3.4')).toBeNull();
    expect(normalizeDomain('not a domain')).toBeNull();
  });
});

describe('domainMatchesPattern & urlMatchesDomain (支持泛域名)', () => {
  it('普通域名匹配本域与子域', () => {
    expect(urlMatchesDomain('https://chatgpt.com/', 'chatgpt.com')).toBe(true);
    expect(urlMatchesDomain('https://chat.chatgpt.com/x', 'chatgpt.com')).toBe(true);
    expect(urlMatchesDomain('https://notchatgpt.com/', 'chatgpt.com')).toBe(false);
  });
  it('泛域名 *.domain.com 匹配本域与所有多级子域', () => {
    expect(urlMatchesDomain('https://google.com/', '*.google.com')).toBe(true);
    expect(urlMatchesDomain('https://www.google.com/search', '*.google.com')).toBe(true);
    expect(urlMatchesDomain('https://mail.google.com/', '*.google.com')).toBe(true);
    expect(urlMatchesDomain('https://sub.sub2.google.com/', '*.google.com')).toBe(true);
    expect(urlMatchesDomain('https://fakegoogle.com/', '*.google.com')).toBe(false);
  });
  it('多级泛域名 *.api.domain.com 精确匹配子树而不误伤其他子域', () => {
    expect(domainMatchesPattern('api.domain.com', '*.api.domain.com')).toBe(true);
    expect(domainMatchesPattern('v1.api.domain.com', '*.api.domain.com')).toBe(true);
    expect(domainMatchesPattern('mail.domain.com', '*.api.domain.com')).toBe(false);
    expect(domainMatchesPattern('domain.com', '*.api.domain.com')).toBe(false);
  });
});

describe('IPv4 / CIDR', () => {
  it('ipToInt', () => {
    expect(ipToInt('0.0.0.0')).toBe(0);
    expect(ipToInt('255.255.255.255')).toBe(0xffffffff);
    expect(ipToInt('1.2.3.256')).toBeNull();
    expect(ipToInt('1.2.3')).toBeNull();
  });
  it('parseCidr', () => {
    expect(parseCidr('10.0.0.0/8')).toEqual({ net: ipToInt('10.0.0.0'), bits: 8 });
    expect(parseCidr('1.2.3.4')).toEqual({ net: ipToInt('1.2.3.4'), bits: 32 });
    expect(parseCidr('1.2.3.4/33')).toBeNull();
    expect(parseCidr('abc')).toBeNull();
  });
  it('ipInCidr', () => {
    expect(ipInCidr('203.0.113.7', '203.0.113.0/24')).toBe(true);
    expect(ipInCidr('203.0.114.7', '203.0.113.0/24')).toBe(false);
    expect(ipInCidr('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipInCidr('1.2.3.4', '1.2.3.4')).toBe(true);
    expect(ipInCidr('1.2.3.5', '1.2.3.4')).toBe(false);
    expect(ipInCidr('anything', '0.0.0.0/0')).toBe(false); // 非法 IP
    expect(ipInCidr('9.9.9.9', '0.0.0.0/0')).toBe(true);
  });
});

describe('evaluateSite（fail-closed 语义）', () => {
  const base = { expectedIpRanges: [] as string[], matchMode: 'any' as const };
  it('国家匹配放行', () => {
    expect(
      evaluateSite({ ...base, expectedCountries: ['SG'] }, '1.2.3.4', 'SG'),
    ).toBe(true);
    expect(
      evaluateSite({ ...base, expectedCountries: ['SG', 'JP'] }, '1.2.3.4', 'JP'),
    ).toBe(true);
  });
  it('国家不匹配拦截', () => {
    expect(
      evaluateSite({ ...base, expectedCountries: ['SG'] }, '1.2.3.4', 'US'),
    ).toBe(false);
  });
  it('未配置任何维度时永不放行', () => {
    expect(evaluateSite({ ...base, expectedCountries: [] }, '1.2.3.4', 'SG')).toBe(false);
  });
  it('any 模式：国家不符但 IP 段命中可放行', () => {
    expect(
      evaluateSite(
        {
          expectedCountries: ['SG'],
          expectedIpRanges: ['203.0.113.0/24'],
          matchMode: 'any',
        },
        '203.0.113.9',
        'US',
      ),
    ).toBe(true);
  });
  it('all 模式：需同时满足', () => {
    const site = {
      expectedCountries: ['SG'],
      expectedIpRanges: ['203.0.113.0/24'],
      matchMode: 'all' as const,
    };
    expect(evaluateSite(site, '203.0.113.9', 'SG')).toBe(true);
    expect(evaluateSite(site, '203.0.113.9', 'US')).toBe(false);
    expect(evaluateSite(site, '8.8.8.8', 'SG')).toBe(false);
  });
});

describe('getRegistrableDomain', () => {
  it('普通域名取后两段', () => {
    expect(getRegistrableDomain('chat.openai.com')).toBe('openai.com');
    expect(getRegistrableDomain('chatgpt.com')).toBe('chatgpt.com');
  });
  it('识别常见二级 TLD', () => {
    expect(getRegistrableDomain('www.gov.uk')).toBe('www.gov.uk');
    expect(getRegistrableDomain('news.bbc.co.uk')).toBe('bbc.co.uk');
    expect(getRegistrableDomain('shop.example.com.cn')).toBe('example.com.cn');
  });
});
