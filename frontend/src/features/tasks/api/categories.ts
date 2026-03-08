import client from '../../../shared/api/client';
import { Category } from './tasks';

export const categoriesApi = {
  getAll: () => client.get<Category[]>('/categories').then((r) => r.data),
};
