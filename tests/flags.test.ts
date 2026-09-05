import { describe, expect, it } from 'vitest';
import { flagEmoji } from '../src/shared/flags';
import { countryName } from '../src/shared/countries';

describe('flagEmoji', () => {
  it('生成区域指示符旗帜', () => {
    expect(flagEmoji('SG')).toBe('🇸🇬');
    expect(flagEmoji('us')).toBe('🇺🇸');
  });
  it('非法代码回退白旗', () => {
    expect(flagEmoji('XYZ')).toBe('🏳️');
    expect(flagEmoji('')).toBe('🏳️');
  });
});

describe('countryName', () => {
  it('已知代码返回中文名', () => {
    expect(countryName('SG')).toBe('新加坡');
    expect(countryName('us')).toBe('美国');
  });
  it('未知代码回退代码本身', () => {
    expect(countryName('ZZ')).toBe('ZZ');
  });
});
