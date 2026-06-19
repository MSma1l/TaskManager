import { describe, expect, it } from 'vitest';
import {
  statusKey,
  statusColor,
  severityKey,
  severityColor,
  stepsProgress,
  ALL_STATUSES,
  ALL_SEVERITIES,
} from './qaConstants';
import { BugStatus, BugSeverity, BugStep } from '../api/bugReports';

describe('statusKey', () => {
  it('maps every status to its i18n key', () => {
    const cases: Record<BugStatus, string> = {
      OPEN: 'qa.statusOpen',
      IN_PROGRESS: 'qa.statusInProgress',
      PASSED: 'qa.statusPassed',
      FAILED: 'qa.statusFailed',
    };
    ALL_STATUSES.forEach((s) => expect(statusKey(s)).toBe(cases[s]));
  });
});

describe('statusColor', () => {
  it('colors each status (green/red/amber/slate)', () => {
    expect(statusColor('PASSED')).toContain('green');
    expect(statusColor('FAILED')).toContain('red');
    expect(statusColor('IN_PROGRESS')).toContain('amber');
    expect(statusColor('OPEN')).toContain('surface');
  });
});

describe('severityKey', () => {
  it('maps every severity to its i18n key', () => {
    const cases: Record<BugSeverity, string> = {
      LOW: 'qa.severityLow',
      MEDIUM: 'qa.severityMedium',
      HIGH: 'qa.severityHigh',
      CRITICAL: 'qa.severityCritical',
    };
    ALL_SEVERITIES.forEach((s) => expect(severityKey(s)).toBe(cases[s]));
  });
});

describe('severityColor', () => {
  it('returns a class for each severity', () => {
    expect(severityColor('LOW')).toContain('surface');
    expect(severityColor('MEDIUM')).toContain('blue');
    expect(severityColor('HIGH')).toContain('amber');
    expect(severityColor('CRITICAL')).toContain('red');
  });
});

describe('stepsProgress', () => {
  const step = (done: boolean): BugStep => ({ id: Math.random().toString(), text: 't', done, result: null });

  it('returns zeros for an empty list', () => {
    expect(stepsProgress([])).toEqual({ done: 0, total: 0, ratio: 0 });
  });

  it('counts done steps and computes the ratio', () => {
    const res = stepsProgress([step(true), step(false), step(true), step(false)]);
    expect(res).toEqual({ done: 2, total: 4, ratio: 0.5 });
  });

  it('reaches ratio 1 when all done', () => {
    expect(stepsProgress([step(true), step(true)])).toEqual({ done: 2, total: 2, ratio: 1 });
  });
});
