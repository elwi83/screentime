import { describe, expect, it } from 'vitest';
import { deduction, duration, escape, stockholmDay } from '../src/domain';
import { Demo } from '../src/demo';

describe('screen-time calculations', () => {
  it('charges twice as much for YouTube', () => {
    expect(deduction(15, 'youtube')).toBe(30);
    expect(deduction(15, 'regular')).toBe(15);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 10001])('rejects invalid minutes: %s', minutes => {
    expect(() => deduction(minutes, 'regular')).toThrow();
  });
  it('uses the Swedish calendar through midnight and daylight-saving transitions', () => {
    expect(stockholmDay(new Date('2026-10-23T22:30:00Z'))).toBe('2026-10-24');
    expect(stockholmDay(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-26');
  });
  it('formats balances and safely escapes user content', () => {
    expect(duration(90)).toBe('1 h 30 min');
    expect(duration(60)).toBe('1 h');
    expect(escape('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });
});

describe('interactive demo', () => {
  it('starts at zero and follows submission, approval, deduction, and rejection', () => {
    const demo = new Demo();
    const [parent, max, walter] = demo.data.profiles;
    expect(max.balance).toBe(0);
    expect(walter.balance).toBe(0);
    demo.submit(max, 'maximilian-0', 'Jag läste en bok.');
    expect(max.balance).toBe(0);
    demo.review(parent, demo.data.requests[0].id, true);
    expect(max.balance).toBe(30);
    expect(() => demo.review(parent, demo.data.requests[0].id, true)).toThrow();
    demo.deduct(parent, max.id, 15, 'youtube');
    expect(max.balance).toBe(0);
    expect(() => demo.deduct(parent, max.id, 1, 'regular')).toThrow();
    demo.submit(walter, 'walter-1', '');
    demo.review(parent, demo.data.requests[0].id, false);
    expect(walter.balance).toBe(0);
  });
  it('enforces daily slots and keeps the submitted reward after an edit', () => {
    const demo = new Demo();
    const [parent, max] = demo.data.profiles;
    for (let i = 0; i < 3; i++) demo.submit(max, 'maximilian-0', '');
    expect(() => demo.submit(max, 'maximilian-0', '')).toThrow();
    demo.review(parent, demo.data.requests[0].id, false);
    demo.submit(max, 'maximilian-0', '');
    demo.edit(parent, 'maximilian-0', { description: 'Ny regel', reward: 100, daily_limit: 3 });
    demo.review(parent, demo.data.requests[0].id, true);
    expect(max.balance).toBe(30);
    expect(() => demo.submit(max, 'walter-0', '')).toThrow();
    expect(() => demo.deduct(max, max.id, 1, 'regular')).toThrow();
  });
});
