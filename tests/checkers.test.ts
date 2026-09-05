import { describe, expect, it } from 'vitest';
import { extractPath, normalizeCountry, normalizeIp } from '../src/shared/checkers';

describe('extractPath', () => {
  const obj = { ip: '1.2.3.4', connection: { isp: 'AWS' }, n: 0 };
  it('单层与多层路径', () => {
    expect(extractPath(obj, 'ip')).toBe('1.2.3.4');
    expect(extractPath(obj, 'connection.isp')).toBe('AWS');
  });
  it('缺失路径返回 undefined', () => {
    expect(extractPath(obj, 'foo')).toBeUndefined();
    expect(extractPath(obj, 'connection.x.y')).toBeUndefined();
    expect(extractPath(null, 'a')).toBeUndefined();
  });
  it('假值字段可正常取出', () => {
    expect(extractPath(obj, 'n')).toBe(0);
  });
});

describe('normalizeCountry', () => {
  it('两位代码统一大写', () => {
    expect(normalizeCountry('sg')).toBe('SG');
    expect(normalizeCountry(' US ')).toBe('US');
  });
  it('拒绝非两位代码', () => {
    expect(normalizeCountry('Singapore')).toBeNull();
    expect(normalizeCountry('')).toBeNull();
    expect(normalizeCountry(undefined)).toBeNull();
    expect(normalizeCountry(123)).toBeNull();
  });
});

describe('normalizeIp', () => {
  it('IPv4 / IPv6', () => {
    expect(normalizeIp('203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
  });
  it('拒绝非法值', () => {
    expect(normalizeIp('hello')).toBeNull();
    expect(normalizeIp(null)).toBeNull();
  });
});
