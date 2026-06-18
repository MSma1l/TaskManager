import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const getAll = vi.fn();
const create = vi.fn();
const update = vi.fn();
const del = vi.fn();
vi.mock('../api/projects', () => ({
  projectsApi: {
    getAll: (...a: unknown[]) => getAll(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}));

import { useProjects } from './useProjects';

describe('useProjects', () => {
  beforeEach(() => {
    getAll.mockReset();
    create.mockReset();
    update.mockReset();
    del.mockReset();
  });

  it('fetches all projects with no filter on mount', async () => {
    getAll.mockResolvedValue([{ id: 'p1' }]);
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getAll).toHaveBeenCalledWith(undefined);
    expect(result.current.projects).toHaveLength(1);
  });

  it('passes the parsed status filter through', async () => {
    getAll.mockResolvedValue([]);
    renderHook(() => useProjects(['ACTIVE', 'ON_HOLD']));
    await waitFor(() => expect(getAll).toHaveBeenCalledWith(['ACTIVE', 'ON_HOLD']));
  });

  it('swallows fetch errors and clears loading', async () => {
    getAll.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toEqual([]);
  });

  it('createProject creates then refetches and returns the project', async () => {
    getAll.mockResolvedValue([]);
    create.mockResolvedValue({ id: 'new' });
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.createProject({ name: 'New' });
    });
    expect(create).toHaveBeenCalledWith({ name: 'New' });
    expect(returned).toEqual({ id: 'new' });
    expect(getAll).toHaveBeenCalledTimes(2);
  });

  it('updateProject updates then refetches', async () => {
    getAll.mockResolvedValue([]);
    update.mockResolvedValue({ id: 'p1', name: 'X' });
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateProject('p1', { name: 'X' });
    });
    expect(update).toHaveBeenCalledWith('p1', { name: 'X' });
    expect(getAll).toHaveBeenCalledTimes(2);
  });

  it('deleteProject removes the project from local state', async () => {
    getAll.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    del.mockResolvedValue(undefined);
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.projects).toHaveLength(2));

    await act(async () => {
      await result.current.deleteProject('p1');
    });
    expect(del).toHaveBeenCalledWith('p1');
    expect(result.current.projects.map((p) => p.id)).toEqual(['p2']);
  });
});
