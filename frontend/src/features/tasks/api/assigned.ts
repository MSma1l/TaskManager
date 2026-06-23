import client from '../../../shared/api/client';
import { BoardPriority, BoardTask, ColumnType, TransitionData } from '../../projects/api/board';
import { Attachment } from '../../../shared/api/attachment';

/** Zonele logice ale board-ului „Repartizate" (agregat peste proiecte). */
export type AssignedZone = 'BACKLOG' | 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'APPROVED';

/** Un task repartizat — `BoardTask` îmbogățit cu proiectul + coloana sursă. */
export type AssignedBoardTask = BoardTask & {
  projectId: string;
  projectName: string;
  columnName: string;
};

export interface AssignedZoneGroup {
  zone: AssignedZone;
  label: string;
  tasks: AssignedBoardTask[];
}

export interface AssignedBoardResponse {
  zones: AssignedZoneGroup[];
  projects: { id: string; name: string }[];
  archived: AssignedBoardTask[];
}

/** A board task assigned to the current user, surfaced on the home page. */
export interface AssignedTask {
  id: string;
  title: string;
  description: string | null;
  priority: BoardPriority;
  taskNumber: number | null;
  taskKey: string | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  dayOfWeek: number | null;
  scheduledDate: string | null;
  reminderTime: string | null;
  columnId: string;
  columnName: string;
  columnType: ColumnType | null;
  /** "QUICK" dacă task-ul vine dintr-un task rapid asignat. */
  origin: string | null;
  project: {
    id: string;
    name: string;
    color: string;
    key: string | null;
  };
  /** Imagini / note vocale atașate (data-URL base64). Poate fi `[]`. */
  attachments?: Attachment[];
}

export const assignedApi = {
  getAssigned: () => client.get<AssignedTask[]>('/tasks/assigned').then((r) => r.data),
  /** Board-ul „Repartizate" pe zone, opțional filtrat după proiect. */
  getBoard: (projectId?: string) =>
    client
      .get<AssignedBoardResponse>('/assigned/board', {
        params: projectId ? { projectId } : undefined,
      })
      .then((r) => r.data),
  /** Plan / schedule an assigned task (same transition endpoint as the board). */
  transition: (projectId: string, taskId: string, data: TransitionData) =>
    client
      .post(`/projects/${projectId}/board/tasks/${taskId}/transition`, data)
      .then((r) => r.data),
};
