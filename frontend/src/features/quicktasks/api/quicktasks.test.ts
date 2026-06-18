import { describe, expect, it, vi, beforeEach } from 'vitest';

// Public submit uses a RAW axios instance — mock axios so axios.create()
// returns a controllable stub. `vi.hoisted` keeps the stub available to the
// hoisted `vi.mock` factory.
const { publicInstance } = vi.hoisted(() => ({ publicInstance: { post: vi.fn() } }));
vi.mock('axios', () => ({
  default: { create: () => publicInstance },
}));

// Authed calls use the shared client.
vi.mock('../../../shared/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import client from '../../../shared/api/client';
import { quickTasksApi } from './quicktasks';

const mock = client as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

describe('quickTasksApi', () => {
  beforeEach(() => {
    mock.get.mockReset();
    mock.post.mockReset();
    publicInstance.post.mockReset();
  });

  it('submitPublic POSTs via the public (no-auth) client', async () => {
    publicInstance.post.mockResolvedValue({ data: { id: 'q1', ok: true } });
    const res = await quickTasksApi.submitPublic({
      requesterName: 'Ana',
      title: 'Fix bug',
      priority: 'NORMAL',
    });
    expect(publicInstance.post).toHaveBeenCalledWith('/quick-tasks/public', {
      requesterName: 'Ana',
      title: 'Fix bug',
      priority: 'NORMAL',
    });
    expect(res).toEqual({ id: 'q1', ok: true });
  });

  it('list defaults to the NEW status param', async () => {
    mock.get.mockResolvedValue({ data: [] });
    await quickTasksApi.list();
    expect(mock.get).toHaveBeenCalledWith('/quick-tasks', { params: { status: 'NEW' } });
  });

  it('list forwards an explicit status', async () => {
    mock.get.mockResolvedValue({ data: [{ id: 'q1' }] });
    const res = await quickTasksApi.list('ALL');
    expect(mock.get).toHaveBeenCalledWith('/quick-tasks', { params: { status: 'ALL' } });
    expect(res).toEqual([{ id: 'q1' }]);
  });

  it('assign POSTs project + assignee', async () => {
    mock.post.mockResolvedValue({ data: { ok: true } });
    await quickTasksApi.assign('q1', 'p1', 'u1');
    expect(mock.post).toHaveBeenCalledWith('/quick-tasks/q1/assign', {
      projectId: 'p1',
      assigneeId: 'u1',
    });
  });

  it('dismiss POSTs the dismiss endpoint', async () => {
    mock.post.mockResolvedValue({ data: { ok: true } });
    await quickTasksApi.dismiss('q1');
    expect(mock.post).toHaveBeenCalledWith('/quick-tasks/q1/dismiss');
  });
});
