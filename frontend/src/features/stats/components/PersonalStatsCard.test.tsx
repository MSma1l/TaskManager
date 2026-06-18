import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { MyPoints } from '../api/metrics';

const getMyPoints = vi.fn();
vi.mock('../api/metrics', () => ({
  metricsApi: { getMyPoints: (...a: unknown[]) => getMyPoints(...a) },
}));

// recharts needs layout/ResizeObserver — stub to plain divs.
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    BarChart: Pass,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    ResponsiveContainer: Pass,
  };
});

import PersonalStatsCard from './PersonalStatsCard';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';

const sample: MyPoints = {
  careerStoryPoints: 142,
  tasksFinished: { total: 50, month: 5, quarter: 12, year: 40 },
  storyPointsThisWeek: 8,
  storyPointsLastWeek: 5,
  trend: 'up',
  trendDelta: 3,
  monthlySeries: [
    { month: '2026-01', points: 10 },
    { month: '2026-02', points: 20 },
  ],
};

function renderCard() {
  return render(
    <I18nProvider>
      <PersonalStatsCard />
    </I18nProvider>,
  );
}

describe('PersonalStatsCard', () => {
  beforeEach(() => getMyPoints.mockReset());

  it('renders career points and the trend after data resolves', async () => {
    getMyPoints.mockResolvedValue(sample);
    renderCard();
    await waitFor(() => expect(screen.getByText('142')).toBeInTheDocument());
    expect(screen.getByText('5')).toBeInTheDocument(); // month tasks
    expect(screen.getByText('12')).toBeInTheDocument(); // quarter tasks
    expect(screen.getByText(/▲/)).toBeInTheDocument(); // up trend icon
  });

  it('renders nothing when the api returns null', async () => {
    getMyPoints.mockResolvedValue(null);
    const { container } = renderCard();
    await waitFor(() => expect(getMyPoints).toHaveBeenCalled());
    // loading skeleton gone, no card rendered
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
  });

  it('handles the flat trend (no chart when all points are zero)', async () => {
    getMyPoints.mockResolvedValue({
      ...sample,
      trend: 'flat',
      monthlySeries: [{ month: '2026-01', points: 0 }],
    });
    renderCard();
    await waitFor(() => expect(screen.getByText('142')).toBeInTheDocument());
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });
});
