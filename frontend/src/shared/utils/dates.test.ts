import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { relativeTime } from './dates';

// Fixed "now" so the relative deltas are deterministic.
const NOW = new Date('2026-06-15T12:00:00.000Z');

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "" for an invalid ISO string', () => {
    expect(relativeTime('not-a-date')).toBe('');
  });

  it('returns "acum" / "только что" for < 45s (RO + RU)', () => {
    expect(relativeTime(ago(0))).toBe('acum');
    expect(relativeTime(ago(10 * SEC))).toBe('acum');
    expect(relativeTime(ago(44 * SEC))).toBe('acum');
    expect(relativeTime(ago(10 * SEC), 'ru')).toBe('только что');
  });

  it('returns minutes for < 60min', () => {
    expect(relativeTime(ago(5 * MIN))).toBe('5 min');
    expect(relativeTime(ago(5 * MIN), 'ru')).toBe('5 мин');
    // 45s rounds up to 1 min
    expect(relativeTime(ago(45 * SEC))).toBe('1 min');
  });

  it('returns hours for < 24h', () => {
    expect(relativeTime(ago(3 * HOUR))).toBe('3 h');
    expect(relativeTime(ago(3 * HOUR), 'ru')).toBe('3 ч');
  });

  it('returns days for <= 7 days', () => {
    expect(relativeTime(ago(2 * DAY))).toBe('2 z');
    expect(relativeTime(ago(2 * DAY), 'ru')).toBe('2 дн');
    expect(relativeTime(ago(7 * DAY))).toBe('7 z');
  });

  it('falls back to an absolute short date past ~7 days', () => {
    // 30 days before 2026-06-15 → mid May. formatDateNice → "<day> Mai".
    const label = relativeTime(ago(30 * DAY));
    expect(label).toMatch(/^\d{1,2} Mai$/);
    // The fallback ignores lang (absolute date format is RO month abbreviations).
    expect(relativeTime(ago(30 * DAY), 'ru')).toBe(label);
  });

  it('defaults to RO when lang is omitted', () => {
    expect(relativeTime(ago(0))).toBe('acum');
  });
});
