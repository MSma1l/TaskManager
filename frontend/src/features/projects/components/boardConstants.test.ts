import { describe, expect, it } from 'vitest';
import {
  actionKey,
  avatarTint,
  columnTypeKey,
  nextAction,
  priorityKey,
  AVATAR_TINTS_COUNT,
} from './boardConstants';
import { BoardPriority, ColumnType, TransitionAction } from '../api/board';

describe('nextAction', () => {
  it('maps each workflow column type to its next action', () => {
    expect(nextAction('BACKLOG')).toBe('plan');
    expect(nextAction('PLANNED')).toBe('start');
    expect(nextAction('IN_PROGRESS')).toBe('done');
    expect(nextAction('DONE')).toBe('approve');
  });

  it('returns null for terminal / non-workflow column types', () => {
    expect(nextAction('APPROVED')).toBeNull();
    expect(nextAction('CUSTOM')).toBeNull();
    expect(nextAction(null)).toBeNull();
  });
});

describe('priorityKey', () => {
  it('maps every priority to its i18n key', () => {
    const cases: Record<BoardPriority, string> = {
      LOW: 'board.priorityLow',
      MEDIUM: 'board.priorityMedium',
      HIGH: 'board.priorityHigh',
      URGENT: 'board.priorityUrgent',
    };
    (Object.keys(cases) as BoardPriority[]).forEach((p) => {
      expect(priorityKey(p)).toBe(cases[p]);
    });
  });
});

describe('actionKey', () => {
  it('maps every transition action to its i18n key', () => {
    const cases: Record<TransitionAction, string> = {
      plan: 'board.plan',
      start: 'board.takeInWork',
      done: 'board.markDone',
      approve: 'board.approve',
    };
    (Object.keys(cases) as TransitionAction[]).forEach((a) => {
      expect(actionKey(a)).toBe(cases[a]);
    });
  });
});

describe('columnTypeKey', () => {
  it('maps every column type to its i18n key', () => {
    const types: ColumnType[] = ['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'DONE', 'APPROVED', 'CUSTOM'];
    types.forEach((ct) => {
      expect(columnTypeKey(ct)).toMatch(/^board\.ct/);
    });
  });
});

describe('avatarTint', () => {
  it('is deterministic for the same seed', () => {
    expect(avatarTint('user-123')).toBe(avatarTint('user-123'));
  });

  it('returns a valid tint class from the palette', () => {
    const tint = avatarTint('whatever');
    expect(typeof tint).toBe('string');
    expect(tint).toContain('bg-');
  });

  it('handles an empty seed without throwing', () => {
    expect(() => avatarTint('')).not.toThrow();
  });

  it('distributes across multiple buckets', () => {
    const seeds = Array.from({ length: 50 }, (_, i) => `seed-${i}`);
    const distinct = new Set(seeds.map(avatarTint));
    expect(distinct.size).toBeGreaterThan(1);
    expect(distinct.size).toBeLessThanOrEqual(AVATAR_TINTS_COUNT);
  });
});
