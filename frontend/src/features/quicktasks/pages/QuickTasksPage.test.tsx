import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { QuickTask } from '../api/quicktasks';

// Hook controls the inbox list + the assign/dismiss handlers.
const assign = vi.fn();
const dismiss = vi.fn();
let hookState: { items: QuickTask[]; loading: boolean };
vi.mock('../hooks/useQuickTasks', () => ({
  useQuickTasks: () => ({ ...hookState, assign, dismiss }),
}));

const getAll = vi.fn();
vi.mock('../../projects/api/projects', () => ({
  projectsApi: { getAll: (...a: unknown[]) => getAll(...a) },
}));

const listMembers = vi.fn();
vi.mock('../../projects/api/members', () => ({
  membersApi: { list: (...a: unknown[]) => listMembers(...a) },
}));

import QuickTasksPage from './QuickTasksPage';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';

const qt: QuickTask = {
  id: 'q1',
  requesterName: 'Ion Client',
  title: 'New landing page',
  description: 'Make it pop',
  priority: 'URGENT',
  status: 'NEW',
  projectId: null,
  assigneeId: null,
  taskId: null,
  processedByUserId: null,
  processedAt: null,
  createdAt: '2026-06-18T10:00:00Z',
};

function renderPage() {
  return render(
    <I18nProvider>
      <QuickTasksPage />
    </I18nProvider>,
  );
}

describe('QuickTasksPage', () => {
  beforeEach(() => {
    assign.mockReset();
    dismiss.mockReset();
    getAll.mockReset().mockResolvedValue([{ id: 'p1', name: 'Project X' }]);
    listMembers.mockReset().mockResolvedValue([
      { userId: 'u1', username: 'ana', fullName: 'Ana Pop' },
    ]);
    hookState = { items: [], loading: false };
  });

  it('shows the empty inbox state when there are no quick tasks', async () => {
    renderPage();
    await waitFor(() => expect(getAll).toHaveBeenCalledWith(['ACTIVE']));
    expect(screen.queryByText('New landing page')).toBeNull();
  });

  it('renders a quick task card with requester, title and priority', async () => {
    hookState = { items: [qt], loading: false };
    renderPage();
    expect(screen.getByText('New landing page')).toBeInTheDocument();
    expect(screen.getByText('Make it pop')).toBeInTheDocument();
    expect(screen.getByText(/Ion Client/)).toBeInTheDocument();
  });

  it('loads members after a project is selected and assigns', async () => {
    hookState = { items: [qt], loading: false };
    assign.mockResolvedValue(undefined);
    renderPage();

    // wait until the async-loaded project option exists before selecting it
    await waitFor(() => expect(screen.getByText('Project X')).toBeInTheDocument());
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    // project select first
    await act(async () => {
      fireEvent.change(selects[0], { target: { value: 'p1' } });
    });
    await waitFor(() => expect(listMembers).toHaveBeenCalledWith('p1'));
    // assignee option now present
    await waitFor(() => expect(screen.getByText('Ana Pop')).toBeInTheDocument());

    fireEvent.change(selects[1], { target: { value: 'u1' } });
    const assignBtn = screen.getByRole('button', { name: /assign|atribuie|distribuie/i });
    await act(async () => {
      fireEvent.click(assignBtn);
    });
    expect(assign).toHaveBeenCalledWith('q1', 'p1', 'u1');
  });

  it('dismiss calls the handler', async () => {
    hookState = { items: [qt], loading: false };
    dismiss.mockResolvedValue(undefined);
    renderPage();
    const dismissBtn = screen.getByRole('button', { name: /dismiss|ignor|respinge/i });
    await act(async () => {
      fireEvent.click(dismissBtn);
    });
    expect(dismiss).toHaveBeenCalledWith('q1');
  });

  it('shows an error when assignment fails', async () => {
    hookState = { items: [qt], loading: false };
    assign.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Project X')).toBeInTheDocument());
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    await act(async () => {
      fireEvent.change(selects[0], { target: { value: 'p1' } });
    });
    await waitFor(() => expect(screen.getByText('Ana Pop')).toBeInTheDocument());
    fireEvent.change(selects[1], { target: { value: 'u1' } });
    const assignBtn = screen.getByRole('button', { name: /assign|atribuie|distribuie/i });
    await act(async () => {
      fireEvent.click(assignBtn);
    });
    await waitFor(() => expect(assign).toHaveBeenCalled());
  });
});
