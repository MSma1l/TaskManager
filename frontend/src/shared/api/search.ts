import client from './client';

export interface SearchResults {
  projects: { id: string; name: string; key?: string; link: string }[];
  tasks: { id: string; title: string; isBoard: boolean; link: string }[];
  events: { id: string; title: string; eventDate?: string | null; link: string }[];
}

export const searchApi = {
  query: (q: string): Promise<SearchResults> =>
    client.get('/search', { params: { q } }).then((r) => r.data),
};
