import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { useTodayBoard } from '../hooks/useTodayBoard';
import { AssignedBoardTask } from '../api/assigned';
import { BoardCardBody } from '../../projects/components/BoardCard';
import AssignedTaskDrawer from './AssignedTaskDrawer';

/** Card cu badge proiect + coloană, click → drawer. */
function TodayCard({ task, onClick }: { task: AssignedBoardTask; onClick: () => void }) {
  return (
    <div onClick={onClick} className="cursor-pointer">
      <div className="flex items-center gap-1.5 mb-1 px-0.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-elevated border border-border text-muted truncate max-w-[60%]">
          {task.projectName}
        </span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-300 truncate">
          {task.columnName}
        </span>
      </div>
      <BoardCardBody task={task} />
    </div>
  );
}

/**
 * Board-ul „Astăzi" — doar coloanele pe zone (BACKLOG → APPROVED), fără
 * niciun chrome (fără filtre, fără toggle, fără titluri de pagină). Umple
 * pe verticală spațiul disponibil; coloanele scrolează intern, iar rândul
 * de coloane scrolează orizontal la depășire.
 */
export default function TodayBoard() {
  const t = useT();
  const [detail, setDetail] = useState<AssignedBoardTask | null>(null);
  const { data, loading, refetch } = useTodayBoard();

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="flex gap-3 overflow-x-auto h-full items-stretch px-1 pb-1">
      {data.zones.map((z) => (
        <div key={z.zone} className="flex flex-col w-72 flex-shrink-0 h-full">
          <div className="flex items-center gap-1.5 px-3 py-2.5 flex-shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted truncate">
              {z.label}
            </h3>
            <span className="text-xs text-muted/70 font-medium">{z.tasks.length}</span>
          </div>
          <div className="flex flex-col gap-2 px-1 flex-1 min-h-0 overflow-y-auto">
            {z.tasks.map((tk) => (
              <TodayCard key={tk.id} task={tk} onClick={() => setDetail(tk)} />
            ))}
            {z.tasks.length === 0 && (
              <p className="text-xs text-muted/60 text-center py-4">{t('board.noTasks')}</p>
            )}
          </div>
        </div>
      ))}

      {detail && (
        <AssignedTaskDrawer
          task={detail}
          projectId={detail.projectId}
          columnName={detail.columnName}
          onClose={() => setDetail(null)}
          onChanged={refetch}
        />
      )}
    </div>
  );
}
