import { Task } from '../api/tasks';
import DayColumn from './DayColumn';

interface WeekGridProps {
  weekDays: Date[];
  tasks: Task[];
  direction: 'left' | 'right' | 'none';
  onTaskClick: (task: Task) => void;
  onAddClick: (date: Date) => void;
}

export default function WeekGrid({ weekDays, tasks, direction, onTaskClick, onAddClick }: WeekGridProps) {
  const animClass = direction === 'right' ? 'slide-in-right' : direction === 'left' ? 'slide-in-left' : '';

  return (
    <div
      key={weekDays[0].toISOString()}
      className={`flex gap-3 overflow-x-auto pb-4 sm:grid sm:grid-cols-7 sm:gap-3 sm:overflow-visible ${animClass}`}
    >
      {weekDays.map((date, i) => (
        <DayColumn
          key={date.toISOString()}
          date={date}
          tasks={tasks}
          onTaskClick={onTaskClick}
          onAddClick={onAddClick}
          index={i}
        />
      ))}
    </div>
  );
}
