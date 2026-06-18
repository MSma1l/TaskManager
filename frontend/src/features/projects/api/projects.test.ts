import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../shared/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import client from '../../../shared/api/client';
import { projectsApi } from './projects';

const mock = client as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('projectsApi', () => {
  beforeEach(() => {
    mock.get.mockReset();
    mock.post.mockReset();
    mock.put.mockReset();
    mock.delete.mockReset();
  });

  it('getAll without statuses passes undefined params', async () => {
    mock.get.mockResolvedValue({ data: [] });
    await projectsApi.getAll();
    expect(mock.get).toHaveBeenCalledWith('/projects', { params: undefined });
  });

  it('getAll with an empty status array passes undefined params', async () => {
    mock.get.mockResolvedValue({ data: [] });
    await projectsApi.getAll([]);
    expect(mock.get).toHaveBeenCalledWith('/projects', { params: undefined });
  });

  it('getAll with statuses joins them into a comma param', async () => {
    mock.get.mockResolvedValue({ data: [{ id: 'p1' }] });
    const res = await projectsApi.getAll(['ACTIVE', 'ON_HOLD']);
    expect(mock.get).toHaveBeenCalledWith('/projects', { params: { status: 'ACTIVE,ON_HOLD' } });
    expect(res).toEqual([{ id: 'p1' }]);
  });

  it('getOne GETs a single project', async () => {
    mock.get.mockResolvedValue({ data: { id: 'p1', tasks: [] } });
    const res = await projectsApi.getOne('p1');
    expect(mock.get).toHaveBeenCalledWith('/projects/p1');
    expect(res).toEqual({ id: 'p1', tasks: [] });
  });

  it('create POSTs the payload', async () => {
    mock.post.mockResolvedValue({ data: { id: 'p2' } });
    const res = await projectsApi.create({ name: 'New' });
    expect(mock.post).toHaveBeenCalledWith('/projects', { name: 'New' });
    expect(res).toEqual({ id: 'p2' });
  });

  it('update PUTs the payload', async () => {
    mock.put.mockResolvedValue({ data: { id: 'p1', name: 'X' } });
    const res = await projectsApi.update('p1', { name: 'X' });
    expect(mock.put).toHaveBeenCalledWith('/projects/p1', { name: 'X' });
    expect(res).toEqual({ id: 'p1', name: 'X' });
  });

  it('delete DELETEs the project', async () => {
    mock.delete.mockResolvedValue({ data: undefined });
    await projectsApi.delete('p1');
    expect(mock.delete).toHaveBeenCalledWith('/projects/p1');
  });
});
