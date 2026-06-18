import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TeamPoints } from '../api/metrics';

const getTeamPoints = vi.fn();
vi.mock('../api/metrics', () => ({
  metricsApi: { getTeamPoints: (...a: unknown[]) => getTeamPoints(...a) },
}));

const getAll = vi.fn();
vi.mock('../../projects/api/projects', () => ({
  projectsApi: { getAll: (...a: unknown[]) => getAll(...a) },
}));

import TeamStatsCard from './TeamStatsCard';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';

const team: TeamPoints = {
  projectId: 'p1',
  perMember: [
    {
      userId: 'u1',
      username: 'ana',
      role: 'MEMBER',
      storyPoints: 21,
      tasksFinished: 4,
      assignedTasks: 6,
      completionRate: 0.667,
    },
  ],
  recommendations: ['Echilibrează încărcarea lui ana'],
};

function renderCard() {
  return render(
    <I18nProvider>
      <TeamStatsCard />
    </I18nProvider>,
  );
}

describe('TeamStatsCard', () => {
  beforeEach(() => {
    getTeamPoints.mockReset();
    getAll.mockReset();
  });

  it('renders nothing when the user manages no projects', async () => {
    getAll.mockResolvedValue([{ id: 'p9', name: 'Viewer-only', role: 'VIEWER' }]);
    const { container } = renderCard();
    await waitFor(() => expect(getAll).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
  });

  it('loads team points for the first manageable project and renders the member table', async () => {
    getAll.mockResolvedValue([{ id: 'p1', name: 'Project X', role: 'ADMIN' }]);
    getTeamPoints.mockResolvedValue(team);
    renderCard();

    await waitFor(() => expect(getTeamPoints).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(screen.getByText('ana')).toBeInTheDocument());
    expect(screen.getByText('21')).toBeInTheDocument(); // story points
    expect(screen.getByText('67%')).toBeInTheDocument(); // rounded completion rate
    expect(screen.getByText('Echilibrează încărcarea lui ana')).toBeInTheDocument();
  });

  it('refetches when a different project is selected', async () => {
    getAll.mockResolvedValue([
      { id: 'p1', name: 'Project X', role: 'OWNER' },
      { id: 'p2', name: 'Project Y', role: 'ADMIN' },
    ]);
    getTeamPoints.mockResolvedValue(team);
    renderCard();

    await waitFor(() => expect(getTeamPoints).toHaveBeenCalledWith('p1'));
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'p2' } });
    });
    await waitFor(() => expect(getTeamPoints).toHaveBeenCalledWith('p2'));
  });
});
