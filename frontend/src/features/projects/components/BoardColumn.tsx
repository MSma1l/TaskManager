import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useT } from '../../../shared/i18n/I18nProvider';
import { BoardColumn as Column, BoardTask, TransitionAction } from '../api/board';
import BoardCard from './BoardCard';

interface BoardColumnProps {
  column: Column;
  tasks: BoardTask[];
  canManage: boolean;
  /** Current user id (from members.isYou) — used to decide assignee actions. */
  myUserId: string | null;
  /** True for OWNER/ADMIN — required to approve. */
  canApprove: boolean;
  onAddCard: (columnId: string) => void;
  onEditColumn: (column: Column) => void;
  onDeleteColumn: (column: Column) => void;
  onCardClick: (task: BoardTask) => void;
  onWorkflowAction: (task: BoardTask, action: TransitionAction) => void;
}

export default function BoardColumn({
  column,
  tasks,
  canManage,
  myUserId,
  canApprove,
  onAddCard,
  onEditColumn,
  onDeleteColumn,
  onCardClick,
  onWorkflowAction,
}: BoardColumnProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', columnId: column.id },
  });

  const accent = column.color || '#475569';

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Top accent */}
      <div className="h-1 rounded-t-xl" style={{ backgroundColor: accent }} />

      <div
        className={`flex flex-col rounded-b-xl bg-elevated/60 border border-t-0 border-border transition-colors ${
          isOver ? 'bg-elevated ring-1 ring-blue-500/30' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted truncate">
              {column.name}
            </h3>
            {column.isDoneColumn && (
              <svg className="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span className="text-xs text-muted/70 font-medium">{tasks.length}</span>
          </div>

          {canManage && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1 rounded-md text-muted hover:text-fg hover:bg-surface transition-colors"
                aria-label={t('board.editColumn')}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-20 w-40 rounded-xl bg-surface border border-border shadow-xl py-1">
                    <button
                      onClick={() => { setMenuOpen(false); onEditColumn(column); }}
                      className="w-full text-left px-3 py-2 text-sm text-fg hover:bg-elevated transition-colors"
                    >
                      {t('board.editColumn')}
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); onDeleteColumn(column); }}
                      className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-elevated transition-colors"
                    >
                      {t('board.deleteColumn')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Cards */}
        <div ref={setNodeRef} className="flex flex-col gap-2 px-2 pb-2 min-h-[60px]">
          <SortableContext items={tasks.map((tk) => tk.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <BoardCard
                key={task.id}
                task={task}
                onClick={onCardClick}
                workflow={{
                  columnType: column.columnType,
                  isAssignee: !!myUserId && task.assignee?.userId === myUserId,
                  canApprove,
                  onAction: onWorkflowAction,
                }}
              />
            ))}
          </SortableContext>
          {tasks.length === 0 && (
            <p className="text-xs text-muted/60 text-center py-4">{t('board.noTasks')}</p>
          )}
        </div>

        {/* Footer add card */}
        {canManage && (
          <button
            onClick={() => onAddCard(column.id)}
            className="m-2 mt-0 px-2 py-2 rounded-lg text-sm text-muted hover:text-fg hover:bg-surface transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('board.addCard')}
          </button>
        )}
      </div>
    </div>
  );
}
