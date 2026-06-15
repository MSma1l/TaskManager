import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Performance } from '../api/performance';

// ── Mock the API module so no network/axios is involved. ─────────────────────
const getPerformance = vi.fn();
vi.mock('../api/performance', () => ({
  performanceApi: { getPerformance: (...args: unknown[]) => getPerformance(...args) },
}));

// recharts renders an SVG via a ResponsiveContainer that needs layout/ResizeObserver;
// stub it to a plain div so the component renders in jsdom without measuring.
vi.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    BarChart: Passthrough,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
    CartesianGrid: () => null,
    ResponsiveContainer: Passthrough,
  };
});

import PerformancePanel from './PerformancePanel';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';

const sample: Performance = {
  totals: { totalCommittedPoints: 30, totalCompletedPoints: 21 },
  perMember: [
    {
      userId: 'u1',
      username: 'alice',
      completedPoints: 13,
      completedTasks: 4,
      assignedPoints: 20,
      completionRate: 0.65,
    },
  ],
  sprints: [
    { sprintId: 's1', name: 'Sprint 1', status: 'COMPLETED', committedPoints: 30, completedPoints: 21 },
  ],
};

function renderPanel() {
  return render(
    <I18nProvider>
      <PerformancePanel projectId="p1" />
    </I18nProvider>,
  );
}

describe('PerformancePanel', () => {
  beforeEach(() => {
    getPerformance.mockReset();
  });

  it('renders totals and the per-member row once data resolves', async () => {
    getPerformance.mockResolvedValue(sample);
    renderPanel();

    // Member row content from the resolved data.
    await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());
    expect(screen.getByText('13')).toBeInTheDocument(); // completed points
    expect(screen.getByText('65%')).toBeInTheDocument(); // completionRate rounded
    expect(screen.getByText('30')).toBeInTheDocument(); // total committed points
    expect(getPerformance).toHaveBeenCalledWith('p1');
  });

  it('shows the empty-state text when the API returns null', async () => {
    getPerformance.mockResolvedValue(null);
    renderPanel();
    // RO default dictionary key pm.noPerformance must resolve to a non-key string.
    await waitFor(() => {
      const empties = screen.getAllByText((_, el) => el?.tagName === 'P' && el.textContent !== '');
      expect(empties.length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('pm.noPerformance')).toBeNull();
  });
});
