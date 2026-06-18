import { describe, expect, it, vi, beforeEach } from 'vitest';

const { publicInstance } = vi.hoisted(() => ({ publicInstance: { get: vi.fn() } }));
vi.mock('axios', () => ({
  default: { create: () => publicInstance },
}));

vi.mock('../../../shared/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import client from '../../../shared/api/client';
import { viewAccountApi, getPublicReport } from './viewaccount';

const mock = client as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

describe('viewAccountApi', () => {
  beforeEach(() => {
    mock.get.mockReset();
    mock.post.mockReset();
    publicInstance.get.mockReset();
  });

  it('createShare POSTs the share payload', async () => {
    mock.post.mockResolvedValue({ data: { id: 's1', token: 'tok' } });
    const res = await viewAccountApi.createShare({ scope: 'team' });
    expect(mock.post).toHaveBeenCalledWith('/report-shares', { scope: 'team' });
    expect(res).toEqual({ id: 's1', token: 'tok' });
  });

  it('listShares GETs the share list', async () => {
    mock.get.mockResolvedValue({ data: [{ id: 's1' }] });
    const res = await viewAccountApi.listShares();
    expect(mock.get).toHaveBeenCalledWith('/report-shares');
    expect(res).toEqual([{ id: 's1' }]);
  });

  it('revokeShare POSTs the revoke endpoint', async () => {
    mock.post.mockResolvedValue({ data: { ok: true } });
    await viewAccountApi.revokeShare('s1');
    expect(mock.post).toHaveBeenCalledWith('/report-shares/s1/revoke');
  });

  it('getPublicReport GETs via the public (no-auth) client', async () => {
    publicInstance.get.mockResolvedValue({ data: { scope: 'team', projects: [] } });
    const res = await getPublicReport('tok123');
    expect(publicInstance.get).toHaveBeenCalledWith('/report-shares/public/tok123');
    expect(res).toEqual({ scope: 'team', projects: [] });
  });
});
