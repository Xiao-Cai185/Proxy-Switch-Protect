import { describe, expect, it } from 'vitest';
import { isIpv4, primaryMatchIp } from '../src/shared/dual-stack';
import { flagPngUrl, flagSvgUrl } from '../src/shared/flags';

describe('isIpv4 / primaryMatchIp', () => {
  it('识别 IPv4', () => {
    expect(isIpv4('1.2.3.4')).toBe(true);
    expect(isIpv4('2001:db8::1')).toBe(false);
  });
  it('匹配优先 IPv4', () => {
    expect(primaryMatchIp({ ip: '2001:db8::1', ipv4: '8.8.8.8' })).toBe('8.8.8.8');
    expect(primaryMatchIp({ ip: '2001:db8::1' })).toBe('2001:db8::1');
  });
});

describe('flagSvgUrl', () => {
  it('返回 SVG CDN 地址', () => {
    expect(flagSvgUrl('SG')).toBe('https://flagcdn.com/sg.svg');
    expect(flagSvgUrl('us')).toBe('https://flagcdn.com/us.svg');
  });
  it('非法代码返回 null', () => {
    expect(flagSvgUrl('XYZ')).toBeNull();
    expect(flagPngUrl('')).toBeNull();
  });
});
