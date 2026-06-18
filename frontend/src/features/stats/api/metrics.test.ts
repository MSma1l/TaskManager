import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../shared/api/client', () => ({
  default: { get: vi.fn() },
}));

import client from '../../../shared/api/client';
import { metricsApi } from './metrics';

const mock = client as unknown as { get: ReturnType<typeof vi.fn> };

describe('metricsApi', () => {
  beforeEach(() => mock.get.mockReset());

  it('getMyPoints GETs the personal points endpoint', async () => {
    mock.get.mockResolvedValue({ data: { careerStoryPoints: 42 } });
    const res = await metricsApi.getMyPoints();
    expect(mock.get).toHaveBeenCalledWith('/stats/me/points');
    expect(res).toEqual({ careerStoryPoints: 42 });
  });

  it('getTeamPoints GETs the team endpoint with a projectId param', async () => {
    mock.get.mockResolvedValue({ data: { projectId: 'p1', perMember: [] } });
    const res = await metricsApi.getTeamPoints('p1');
    expect(mock.get).toHaveBeenCalledWith('/stats/team/points', { params: { projectId: 'p1' } });
    expect(res).toEqual({ projectId: 'p1', perMember: [] });
  });
});
