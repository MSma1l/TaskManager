import { useEffect, useMemo, useState } from 'react';
import { BoardTask } from '../../projects/api/board';
import { boardApi } from '../../projects/api/board';
import { membersApi, ProjectMember } from '../../projects/api/members';
import TaskDetailDrawer from '../../projects/components/TaskDetailDrawer';

interface Props {
  task: BoardTask;
  projectId: string;
  columnName: string;
  onClose: () => void;
  /** Reîncarcă board-ul după o modificare (assign / subtask). */
  onChanged: () => void;
}

/**
 * Deschide `TaskDetailDrawer` pentru un task repartizat, încărcând membrii
 * proiectului acelui task și legând acțiunile (assign, checklist) la
 * endpoint-urile board-ului de proiect, apelate cu `projectId`-ul potrivit.
 */
export default function AssignedTaskDrawer({
  task,
  projectId,
  columnName,
  onClose,
  onChanged,
}: Props) {
  const [members, setMembers] = useState<ProjectMember[]>([]);

  useEffect(() => {
    let cancelled = false;
    membersApi
      .list(projectId)
      .then((m) => {
        if (!cancelled) setMembers(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const myUserId = useMemo(() => members.find((m) => m.isYou)?.userId ?? null, [members]);

  return (
    <TaskDetailDrawer
      task={task}
      columnType={null}
      columnName={columnName}
      members={members}
      myUserId={myUserId}
      canApprove={false}
      onClose={onClose}
      onEdit={onClose}
      onWorkflowAction={() => {}}
      onAssign={async (taskId, ids) => {
        await boardApi.assignTask(projectId, taskId, ids);
        onChanged();
      }}
      onAddSubtask={async (taskId, title) => {
        await boardApi.addSubtask(projectId, taskId, title);
        onChanged();
      }}
      onToggleSubtask={async (taskId, sid, done) => {
        await boardApi.updateSubtask(projectId, taskId, sid, { done });
        onChanged();
      }}
      onRemoveSubtask={async (taskId, sid) => {
        await boardApi.removeSubtask(projectId, taskId, sid);
        onChanged();
      }}
    />
  );
}
