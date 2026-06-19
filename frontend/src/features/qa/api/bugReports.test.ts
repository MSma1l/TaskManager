import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../shared/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import client from '../../../shared/api/client';
import { bugReportsApi } from './bugReports';

const mock = client as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('bugReportsApi', () => {
  beforeEach(() => {
    mock.get.mockReset();
    mock.post.mockReset();
    mock.put.mockReset();
    mock.delete.mockReset();
  });

  it('list without status omits params', async () => {
    mock.get.mockResolvedValue({ data: [{ id: 'b1' }] });
    const res = await bugReportsApi.list('p1');
    expect(mock.get).toHaveBeenCalledWith('/projects/p1/bug-reports', { params: undefined });
    expect(res).toEqual([{ id: 'b1' }]);
  });

  it('list forwards the status filter', async () => {
    mock.get.mockResolvedValue({ data: [] });
    await bugReportsApi.list('p1', 'FAILED');
    expect(mock.get).toHaveBeenCalledWith('/projects/p1/bug-reports', {
      params: { status: 'FAILED' },
    });
  });

  it('get fetches a single report', async () => {
    mock.get.mockResolvedValue({ data: { id: 'b1' } });
    const res = await bugReportsApi.get('p1', 'b1');
    expect(mock.get).toHaveBeenCalledWith('/projects/p1/bug-reports/b1');
    expect(res).toEqual({ id: 'b1' });
  });

  it('create POSTs the body', async () => {
    mock.post.mockResolvedValue({ data: { id: 'b1' } });
    const body = { title: 'Crash', severity: 'HIGH' as const, steps: [{ text: 'open' }] };
    const res = await bugReportsApi.create('p1', body);
    expect(mock.post).toHaveBeenCalledWith('/projects/p1/bug-reports', body);
    expect(res).toEqual({ id: 'b1' });
  });

  it('update PUTs partial fields', async () => {
    mock.put.mockResolvedValue({ data: { id: 'b1', status: 'PASSED' } });
    const res = await bugReportsApi.update('p1', 'b1', { status: 'PASSED' });
    expect(mock.put).toHaveBeenCalledWith('/projects/p1/bug-reports/b1', { status: 'PASSED' });
    expect(res).toEqual({ id: 'b1', status: 'PASSED' });
  });

  it('remove DELETEs the report', async () => {
    mock.delete.mockResolvedValue({ data: { ok: true } });
    await bugReportsApi.remove('p1', 'b1');
    expect(mock.delete).toHaveBeenCalledWith('/projects/p1/bug-reports/b1');
  });

  it('addAttachment POSTs imageData + caption', async () => {
    mock.post.mockResolvedValue({ data: { id: 'a1' } });
    const res = await bugReportsApi.addAttachment('p1', 'b1', 'data:image/png;base64,xxx', 'cap');
    expect(mock.post).toHaveBeenCalledWith('/projects/p1/bug-reports/b1/attachments', {
      imageData: 'data:image/png;base64,xxx',
      caption: 'cap',
    });
    expect(res).toEqual({ id: 'a1' });
  });

  it('addAttachment without caption sends undefined', async () => {
    mock.post.mockResolvedValue({ data: { id: 'a1' } });
    await bugReportsApi.addAttachment('p1', 'b1', 'data:image/png;base64,yyy');
    expect(mock.post).toHaveBeenCalledWith('/projects/p1/bug-reports/b1/attachments', {
      imageData: 'data:image/png;base64,yyy',
      caption: undefined,
    });
  });

  it('removeAttachment DELETEs the attachment', async () => {
    mock.delete.mockResolvedValue({ data: {} });
    await bugReportsApi.removeAttachment('p1', 'b1', 'a1');
    expect(mock.delete).toHaveBeenCalledWith('/projects/p1/bug-reports/b1/attachments/a1');
  });

  it('addComment POSTs the body', async () => {
    mock.post.mockResolvedValue({ data: { id: 'c1' } });
    const res = await bugReportsApi.addComment('p1', 'b1', 'looks broken');
    expect(mock.post).toHaveBeenCalledWith('/projects/p1/bug-reports/b1/comments', {
      body: 'looks broken',
    });
    expect(res).toEqual({ id: 'c1' });
  });

  it('removeComment DELETEs the comment', async () => {
    mock.delete.mockResolvedValue({ data: {} });
    await bugReportsApi.removeComment('p1', 'b1', 'c1');
    expect(mock.delete).toHaveBeenCalledWith('/projects/p1/bug-reports/b1/comments/c1');
  });
});
