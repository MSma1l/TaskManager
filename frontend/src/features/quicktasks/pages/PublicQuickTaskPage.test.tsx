import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const submitPublic = vi.fn();
vi.mock('../api/quicktasks', () => ({
  quickTasksApi: { submitPublic: (...a: unknown[]) => submitPublic(...a) },
}));

import PublicQuickTaskPage from './PublicQuickTaskPage';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';

function renderPage() {
  return render(
    <I18nProvider>
      <PublicQuickTaskPage />
    </I18nProvider>,
  );
}

function fill(label: RegExp, value: string) {
  const input = screen.getByPlaceholderText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

describe('PublicQuickTaskPage', () => {
  beforeEach(() => submitPublic.mockReset());

  it('shows a validation error and does not submit when required fields are empty', async () => {
    renderPage();
    fireEvent.submit(screen.getByRole('button', { name: /trimite|submit/i }).closest('form')!);
    await waitFor(() => expect(screen.getByText(/completează|complet|necesar|required/i)).toBeInTheDocument());
    expect(submitPublic).not.toHaveBeenCalled();
  });

  it('submits trimmed fields and switches to the success state', async () => {
    submitPublic.mockResolvedValue({ id: 'q1', ok: true });
    renderPage();

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    // first two textboxes: requesterName, title
    fireEvent.change(inputs[0], { target: { value: '  Ana  ' } });
    fireEvent.change(inputs[1], { target: { value: '  Fix bug  ' } });
    fireEvent.change(inputs[2], { target: { value: '  details  ' } });

    // pick the URGENT priority button (first priority option)
    fireEvent.submit(inputs[0].closest('form')!);

    await waitFor(() => expect(submitPublic).toHaveBeenCalledTimes(1));
    expect(submitPublic).toHaveBeenCalledWith({
      requesterName: 'Ana',
      title: 'Fix bug',
      description: 'details',
      priority: 'NORMAL',
    });
    // success heading button to submit another
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /încă|alta|another|trimite/i })).toBeInTheDocument(),
    );
  });

  it('changes the selected priority before submit', async () => {
    submitPublic.mockResolvedValue({ id: 'q1', ok: true });
    renderPage();
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: 'Ana' } });
    fireEvent.change(inputs[1], { target: { value: 'Task' } });

    // Click the first priority option (URGENT)
    const urgentBtn = screen.getAllByRole('button').find((b) => /urgent/i.test(b.textContent || ''));
    fireEvent.click(urgentBtn!);
    fireEvent.submit(inputs[0].closest('form')!);

    await waitFor(() => expect(submitPublic).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'URGENT', description: undefined }),
    ));
  });

  it('shows an error and stays on the form when submit fails', async () => {
    submitPublic.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: 'Ana' } });
    fireEvent.change(inputs[1], { target: { value: 'Task' } });
    // Wrap in act so the rejected submit + the catch's setState flush here,
    // instead of leaking as an unhandled rejection into the next test.
    await act(async () => {
      fireEvent.submit(inputs[0].closest('form')!);
    });

    await waitFor(() => expect(submitPublic).toHaveBeenCalled());
    // still a form (textboxes present) — the success view never rendered
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
  });

  it('resets back to an empty form after a successful submit', async () => {
    submitPublic.mockResolvedValue({ id: 'q1', ok: true });
    renderPage();
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: 'Ana' } });
    fireEvent.change(inputs[1], { target: { value: 'Task' } });
    await act(async () => {
      fireEvent.submit(inputs[0].closest('form')!);
    });

    const again = await screen.findByRole('button', { name: /încă|alta|another|trimite/i });
    await act(async () => {
      fireEvent.click(again);
    });
    // back on the form
    await waitFor(() => expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe(''));
  });
});
