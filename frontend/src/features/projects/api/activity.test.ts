import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../shared/api/client', () => ({
  default: { get: vi.fn() },
}));

import client from '../../../shared/api/client';
import { activityApi } from './activity';

const mock = client as unknown as { get: ReturnType<typeof vi.fn> };

describe('activityApi', () => {
  beforeEach(() => mock.get.mockReset());

  it('list GETs the task activity endpoint', async () => {
    mock.get.mockResolvedValue({ data: [{ id: 'a1' }] });
    const res = await activityApi.list('t1');
    expect(mock.get).toHaveBeenCalledWith('/tasks/t1/activity');
    expect(res).toEqual([{ id: 'a1' }]);
  });

  it('projectActivity uses the default limit and undefined filters', async () => {
    mock.get.mockResolvedValue({ data: [] });
    await activityApi.projectActivity('p1');
    expect(mock.get).toHaveBeenCalledWith('/projects/p1/activity', {
      params: { limit: 50, action: undefined, user: undefined, sort: undefined },
    });
  });

  it('projectActivity forwards limit + filter/sort options', async () => {
    mock.get.mockResolvedValue({ data: [{ id: 'x' }] });
    const res = await activityApi.projectActivity('p1', 10, {
      action: 'COMMENTED',
      user: 'u1',
      sort: 'priority',
    });
    expect(mock.get).toHaveBeenCalledWith('/projects/p1/activity', {
      params: { limit: 10, action: 'COMMENTED', user: 'u1', sort: 'priority' },
    });
    expect(res).toEqual([{ id: 'x' }]);
  });

  it('coerces empty-string options back to undefined', async () => {
    mock.get.mockResolvedValue({ data: [] });
    await activityApi.projectActivity('p1', 25, { action: '', user: '', sort: undefined });
    expect(mock.get).toHaveBeenCalledWith('/projects/p1/activity', {
      params: { limit: 25, action: undefined, user: undefined, sort: undefined },
    });
  });
});
