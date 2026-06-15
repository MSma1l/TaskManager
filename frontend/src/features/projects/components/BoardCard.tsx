import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BoardTask } from '../api/board';
import { PRIORITY_DOT, avatarTint } from './boardConstants';

interface BoardCardProps {
  task: BoardTask;
  onClick?: (task: BoardTask) => void;
  /** When true, renders the static card body (used inside DragOverlay). */
  overlay?: boolean;
}

/** Inner presentational card — shared by the sortable card and the drag overlay. */
export function BoardCardBody({ task, dragging }: { task: BoardTask; dragging?: boolean }) {
  const initials = task.assignee
    ? (task.assignee.fullName || task.assignee.username).charAt(0).toUpperCase()
    : null;

  return (
    <div
      className={`rounded-xl bg-surface border border-border p-3 shadow-sm transition-all duration-150 hover:border-blue-500/40 hover:shadow-md ${
        dragging ? 'shadow-xl ring-1 ring-blue-500/40 rotate-1' : ''
      }`}
    >
      {/* Labels */}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map((l) => (
            <span
              key={l.id}
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-tight"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-medium text-fg leading-snug break-words">{task.title}</p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2.5 text-muted">
          {/* Priority */}
          <span className="flex items-center gap-1" title={task.priority}>
            <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[task.priority]}`} />
          </span>
          {/* Comments */}
          {task.commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {task.commentCount}
            </span>
          )}
        </div>

        {/* Assignee */}
        {initials && (
          <div
            title={task.assignee?.fullName || task.assignee?.username || ''}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${avatarTint(
              task.assignee?.userId || '',
            )}`}
          >
            {initials}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BoardCard({ task, onClick }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(task)}
      className="cursor-grab active:cursor-grabbing touch-none"
    >
      <BoardCardBody task={task} />
    </div>
  );
}
