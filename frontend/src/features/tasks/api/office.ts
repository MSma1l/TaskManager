import client from '../../../shared/api/client';
import { BoardTask } from '../../projects/api/board';

/** O coloană de pe board-ul de birou (Backlog / În lucru / Finalizat / Verificat). */
export interface OfficeColumn {
  id: string;
  name: string;
  columnType: string;
  position: number;
  isDoneColumn: boolean;
}

/**
 * Răspunsul board-ului de birou. Task-urile au exact aceeași formă ca pe
 * board-ul de proiect (`BoardTask`), așa că reutilizăm componentele existente.
 */
export interface OfficeBoardResponse {
  projectId: string;
  isAdmin: boolean;
  columns: OfficeColumn[];
  tasks: BoardTask[];
  /** Doar pentru admin: task-uri de birou care așteaptă un responsabil. */
  inbox: BoardTask[];
}

export const officeApi = {
  getBoard: () => client.get<OfficeBoardResponse>('/office/board').then((r) => r.data),
};
