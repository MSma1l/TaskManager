import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../shared/api/client', () => ({
  default: { get: vi.fn() },
}));

import client from '../../../shared/api/client';
import { reportsApi } from './reports';

const mock = client as unknown as { get: ReturnType<typeof vi.fn> };

describe('reportsApi', () => {
  beforeEach(() => mock.get.mockReset());

  it('list GETs the project reports endpoint and unwraps data', async () => {
    mock.get.mockResolvedValue({ data: [{ sprintId: 's1', name: 'Sprint 1' }] });
    const res = await reportsApi.list('p1');
    expect(mock.get).toHaveBeenCalledWith('/projects/p1/reports');
    expect(res).toEqual([{ sprintId: 's1', name: 'Sprint 1' }]);
  });
});
