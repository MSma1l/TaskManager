import client from '../../../shared/api/client';
import { AssignedBoardResponse } from './assigned';

/**
 * Board-ul „Astăzi": aceleași zone ca board-ul „Repartizate", dar agregat
 * automat peste proiectele marcate de admin + proiectul „Birou".
 * Reutilizează forma `AssignedBoardResponse` (același contract).
 */
export const todayApi = {
  getBoard: () => client.get<AssignedBoardResponse>('/today/board').then((r) => r.data),
};
