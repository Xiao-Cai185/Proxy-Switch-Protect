import { describe, expect, it } from 'vitest';
import {
  computeSuggestion,
  domainCovered,
  pruneHabits,
  recordVisit,
  shiftDate,
} from '../src/shared/habits-core';
import type { HabitStore, ProtectedSite } from '../src/shared/types';

const TODAY = '2026-09-04';

function makeHabits(domain: string, cc: string, days: number, endDate = TODAY): HabitStore {
  const habits: HabitStore = {};
  for (let i = 0; i < days; i++) {
    recordVisit(habits, domain, cc, shiftDate(endDate, -i));
  }
  return habits;
}

describe('recordVisit', () => {
  it('按天去重', () => {
    const h: HabitStore = {};
    expect(recordVisit(h, 'a.com', 'SG', TODAY)).toBe(true);
    expect(recordVisit(h, 'a.com', 'SG', TODAY)).toBe(false);
    expect(h['a.com'].SG).toEqual([TODAY]);
  });
});

describe('pruneHabits', () => {
  it('清理超期记录并删除空条目', () => {
    const h = makeHabits('a.com', 'SG', 3, shiftDate(TODAY, -100));
    expect(pruneHabits(h, TODAY, 90)).toBe(true);
    expect(h['a.com']).toBeUndefined();
  });
  it('保留期内不变', () => {
    const h = makeHabits('a.com', 'SG', 3);
    expect(pruneHabits(h, TODAY, 90)).toBe(false);
    expect(h['a.com'].SG).toHaveLength(3);
  });
});

describe('computeSuggestion', () => {
  const opts = { windowDays: 14, minDays: 5, ratio: 0.9 };

  it('稳定使用同一国家 -> 给出建议', () => {
    const h = makeHabits('chatgpt.com', 'SG', 6);
    const res = computeSuggestion(h, 'chatgpt.com', opts, TODAY);
    expect(res).not.toBeNull();
    expect(res!.countryCode).toBe('SG');
    expect(res!.days).toBe(6);
  });

  it('天数不足 -> 无建议', () => {
    const h = makeHabits('chatgpt.com', 'SG', 4);
    expect(computeSuggestion(h, 'chatgpt.com', opts, TODAY)).toBeNull();
  });

  it('国家分散（占比不足）-> 无建议', () => {
    const h = makeHabits('x.com', 'SG', 5);
    recordVisit(h, 'x.com', 'US', shiftDate(TODAY, -1));
    recordVisit(h, 'x.com', 'US', shiftDate(TODAY, -2));
    recordVisit(h, 'x.com', 'JP', shiftDate(TODAY, -3));
    expect(computeSuggestion(h, 'x.com', opts, TODAY)).toBeNull();
  });

  it('窗口之外的记录不参与统计', () => {
    const h = makeHabits('old.com', 'SG', 10, shiftDate(TODAY, -30));
    expect(computeSuggestion(h, 'old.com', opts, TODAY)).toBeNull();
  });
});

describe('domainCovered', () => {
  const site = (domain: string, enabled = true): ProtectedSite => ({
    id: domain,
    domainPattern: domain,
    expectedCountries: ['SG'],
    expectedIpRanges: [],
    matchMode: 'any',
    enabled,
    createdAt: 0,
    updatedAt: 0,
  });
  it('本域与子域均视为已覆盖', () => {
    expect(domainCovered([site('chatgpt.com')], 'chatgpt.com')).toBe(true);
    expect(domainCovered([site('chatgpt.com')], 'chat.chatgpt.com')).toBe(true);
  });
  it('未启用的规则不算覆盖', () => {
    expect(domainCovered([site('chatgpt.com', false)], 'chatgpt.com')).toBe(false);
  });
  it('无关域名不覆盖', () => {
    expect(domainCovered([site('chatgpt.com')], 'openai.com')).toBe(false);
  });
});
