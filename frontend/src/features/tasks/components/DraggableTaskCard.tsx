import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '../api/tasks';
import TaskCard from './TaskCard';

interface DraggableTaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  onTakeInWork?: (task: Task) => void;
  onComplete?: (task: Task) => void;
}

/**
 * Wraps a {@link TaskCard} as a @dnd-kit draggable for the weekly board.
 * The card stays clickable (PointerSensor uses an activation distance, so a
 * tap without movement still fires onClick → opens the mini-frame).
 */
export default function DraggableTaskCard({ task, onClick, onTakeInWork, onComplete }: DraggableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { type: 'weekTask' },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={isDragging ? 'opacity-40' : ''}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onClick={onClick} onTakeInWork={onTakeInWork} onComplete={onComplete} />
    </div>
  );
}
