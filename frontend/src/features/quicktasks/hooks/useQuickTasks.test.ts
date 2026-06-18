import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const list = vi.fn();
const assign = vi.fn();
const dismiss = vi.fn();
vi.mock('../api/quicktasks', () => ({
  quickTasksApi: {
    list: (...a: unknown[]) => list(...a),
    assign: (...a: unknown[]) => assign(...a),
    dismiss: (...a: unknown[]) => dismiss(...a),
  },
}));

import { useQuickTasks } from './useQuickTasks';

describe('useQuickTasks', () => {
  beforeEach(() => {
    list.mockReset();
    assign.mockReset();
    dismiss.mockReset();
  });

  it('loads items for the given status on mount', async () => {
    list.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    const { result } = renderHook(() => useQuickTasks('NEW'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(list).toHaveBeenCalledWith('NEW');
    expect(result.current.items).toHaveLength(2);
  });

  it('keeps the previous list and stops loading when the fetch fails', async () => {
    list.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useQuickTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it('removes a task from the list after assign', async () => {
    list.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    assign.mockResolvedValue(undefined);
    const { result } = renderHook(() => useQuickTasks());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => {
      await result.current.assign('q1', 'p1', 'u1');
    });
    expect(assign).toHaveBeenCalledWith('q1', 'p1', 'u1');
    expect(result.current.items.map((i) => i.id)).toEqual(['q2']);
  });

  it('removes a task from the list after dismiss', async () => {
    list.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    dismiss.mockResolvedValue(undefined);
    const { result } = renderHook(() => useQuickTasks());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => {
      await result.current.dismiss('q2');
    });
    expect(dismiss).toHaveBeenCalledWith('q2');
    expect(result.current.items.map((i) => i.id)).toEqual(['q1']);
  });

  it('refetches when the window regains focus', async () => {
    list.mockResolvedValue([]);
    renderHook(() => useQuickTasks());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('refetches when the document becomes visible', async () => {
    list.mockResolvedValue([]);
    renderHook(() => useQuickTasks());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
