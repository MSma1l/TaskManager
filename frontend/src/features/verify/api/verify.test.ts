import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../shared/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import client from '../../../shared/api/client';
import { verifyApi } from './verify';

const mock = client as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

describe('verifyApi', () => {
  beforeEach(() => {
    mock.get.mockReset();
    mock.post.mockReset();
  });

  it('listPending GETs the pending-verification endpoint and unwraps data', async () => {
    mock.get.mockResolvedValue({ data: [{ id: 't1' }] });
    const res = await verifyApi.listPending();
    expect(mock.get).toHaveBeenCalledWith('/tasks/pending-verification');
    expect(res).toEqual([{ id: 't1' }]);
  });

  it('approve POSTs to the approve endpoint', async () => {
    mock.post.mockResolvedValue({ data: { ok: true } });
    const res = await verifyApi.approve('t1');
    expect(mock.post).toHaveBeenCalledWith('/tasks/t1/approve');
    expect(res).toEqual({ ok: true });
  });

  it('returnToFix POSTs the reason body', async () => {
    mock.post.mockResolvedValue({ data: {} });
    await verifyApi.returnToFix('t2', 'fix it');
    expect(mock.post).toHaveBeenCalledWith('/tasks/t2/return', { reason: 'fix it' });
  });

  it('reject POSTs the reason body', async () => {
    mock.post.mockResolvedValue({ data: {} });
    await verifyApi.reject('t3', 'nope');
    expect(mock.post).toHaveBeenCalledWith('/tasks/t3/reject', { reason: 'nope' });
  });
});
