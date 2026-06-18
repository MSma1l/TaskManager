import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PendingTask } from '../api/verify';

// Mock the API module so no axios/network is involved.
const listPending = vi.fn();
const approve = vi.fn();
const returnToFix = vi.fn();
const reject = vi.fn();
vi.mock('../api/verify', () => ({
  verifyApi: {
    listPending: (...a: unknown[]) => listPending(...a),
    approve: (...a: unknown[]) => approve(...a),
    returnToFix: (...a: unknown[]) => returnToFix(...a),
    reject: (...a: unknown[]) => reject(...a),
  },
}));

import VerifyPage from './VerifyPage';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';

const task: PendingTask = {
  id: 't1',
  title: 'Fix the login bug',
  description: 'It breaks on Safari',
  priority: 'HIGH',
  assignee: { userId: 'u1', username: 'ana', fullName: 'Ana Pop' } as PendingTask['assignee'],
  labels: [],
  storyPoints: 5,
  approvalStatus: 'PENDING_REVIEW',
  taskKey: 'PRJ-12',
  taskNumber: 12,
  commentCount: 3,
  project: { id: 'p1', name: 'Project X', color: '#abc', key: 'PRJ' },
  projectId: 'p1',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <VerifyPage />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('VerifyPage', () => {
  beforeEach(() => {
    listPending.mockReset();
    approve.mockReset();
    returnToFix.mockReset();
    reject.mockReset();
    vi.restoreAllMocks();
  });

  it('renders the empty state when there are no pending tasks', async () => {
    listPending.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(listPending).toHaveBeenCalled());
    // empty-state container present, no task title
    expect(screen.queryByText('Fix the login bug')).toBeNull();
  });

  it('renders a pending task card with its key, project and assignee', async () => {
    listPending.mockResolvedValue([task]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Fix the login bug')).toBeInTheDocument());
    expect(screen.getByText('PRJ-12')).toBeInTheDocument();
    expect(screen.getByText('Project X')).toBeInTheDocument();
    expect(screen.getByText('Ana Pop')).toBeInTheDocument();
    expect(screen.getByText('It breaks on Safari')).toBeInTheDocument();
  });

  it('approve calls the api and removes the task optimistically', async () => {
    listPending.mockResolvedValue([task]);
    approve.mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(screen.getByText('Fix the login bug')).toBeInTheDocument());

    const approveBtn = screen.getByRole('button', { name: /aprob|approve/i });
    await act(async () => {
      fireEvent.click(approveBtn);
    });
    expect(approve).toHaveBeenCalledWith('t1');
    await waitFor(() => expect(screen.queryByText('Fix the login bug')).toBeNull());
  });

  it('returnToFix prompts for a reason and forwards the trimmed value', async () => {
    listPending.mockResolvedValue([task]);
    returnToFix.mockResolvedValue({});
    vi.spyOn(window, 'prompt').mockReturnValue('  please fix CSS  ');
    renderPage();
    await waitFor(() => expect(screen.getByText('Fix the login bug')).toBeInTheDocument());

    const returnBtn = screen.getByRole('button', { name: /întorc|return|corect/i });
    await act(async () => {
      fireEvent.click(returnBtn);
    });
    expect(returnToFix).toHaveBeenCalledWith('t1', 'please fix CSS');
  });

  it('does nothing when the reject prompt is cancelled', async () => {
    listPending.mockResolvedValue([task]);
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByText('Fix the login bug')).toBeInTheDocument());

    const rejectBtn = screen.getByRole('button', { name: /reject|resping/i });
    await act(async () => {
      fireEvent.click(rejectBtn);
    });
    expect(reject).not.toHaveBeenCalled();
    // task stays in the list
    expect(screen.getByText('Fix the login bug')).toBeInTheDocument();
  });

  it('re-syncs by reloading when an action fails', async () => {
    listPending.mockResolvedValue([task]);
    approve.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Fix the login bug')).toBeInTheDocument());

    listPending.mockResolvedValue([task]); // reload returns the task again
    const approveBtn = screen.getByRole('button', { name: /aprob|approve/i });
    await act(async () => {
      fireEvent.click(approveBtn);
    });
    await waitFor(() => expect(listPending).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Fix the login bug')).toBeInTheDocument();
  });
});
