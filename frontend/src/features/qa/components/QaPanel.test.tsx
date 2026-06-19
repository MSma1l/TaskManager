import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { BugReportSummary } from '../api/bugReports';

const create = vi.fn();
const remove = vi.fn();
const refetch = vi.fn();
const useBugReports = vi.fn();

vi.mock('../hooks/useBugReports', () => ({
  useBugReports: (...a: unknown[]) => useBugReports(...a),
}));

// Drawer is exercised separately; stub it to a marker so the panel test stays light.
vi.mock('./BugReportDrawer', () => ({
  default: ({ reportId }: { reportId: string }) => <div data-testid="drawer">{reportId}</div>,
}));

import QaPanel from './QaPanel';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';

const sample: BugReportSummary = {
  id: 'b1',
  title: 'Login crashes',
  status: 'FAILED',
  severity: 'CRITICAL',
  attachmentCount: 2,
  commentCount: 3,
  stepsDone: 1,
  stepsTotal: 4,
  createdByName: 'Ana',
  assigneeName: 'Bob',
  createdAt: '2026-06-18T10:00:00Z',
};

function renderPanel() {
  return render(
    <I18nProvider>
      <QaPanel projectId="p1" myRole="OWNER" />
    </I18nProvider>,
  );
}

describe('QaPanel', () => {
  beforeEach(() => {
    create.mockReset();
    remove.mockReset();
    refetch.mockReset();
    useBugReports.mockReturnValue({ reports: [sample], loading: false, create, remove, refetch });
  });

  it('renders a report card with progress + counts', () => {
    renderPanel();
    expect(screen.getByText('Login crashes')).toBeInTheDocument();
    // Progress text is interleaved with the ✓ marker, so match on substring.
    expect(screen.getByText((_, el) => el?.textContent === '✓ 1/4')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows the empty state when there are no reports', () => {
    useBugReports.mockReturnValue({ reports: [], loading: false, create, remove, refetch });
    renderPanel();
    // qa namespace is wired in the dictionary → resolves to the RO string.
    expect(screen.getByText('Niciun raport încă')).toBeInTheDocument();
  });

  it('opens the drawer when a card is clicked', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Login crashes'));
    expect(screen.getByTestId('drawer')).toHaveTextContent('b1');
  });

  it('creates a report through the modal', async () => {
    create.mockResolvedValue({ id: 'b2' });
    renderPanel();
    fireEvent.click(screen.getByText('+ Raport nou'));
    const title = screen.getByText('Titlu').parentElement!.querySelector('input')!;
    fireEvent.change(title, { target: { value: 'New bug' } });
    // common.save resolves to the Romanian dictionary value.
    fireEvent.click(screen.getByText('Salveaza'));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New bug', severity: 'MEDIUM' }),
      ),
    );
  });
});
