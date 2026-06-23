import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../../shared/i18n/I18nProvider';
import { tasksApi, Task } from '../api/tasks';
import { assignedApi, AssignedTask } from '../api/assigned';
import { calendarApi, CalendarEvent } from '../../calendar/api/calendar';
import OfficeBoard from '../components/OfficeBoard';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Pagina „Astăzi" (focus): adună într-un singur loc ce ai de făcut azi —
 * taskurile personale de azi, taskurile de proiect atribuite ție, și
 * evenimentele de calendar de azi.
 */
export default function TodayPage() {
  const t = useT();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assigned, setAssigned] = useState<AssignedTask[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const iso = todayISO();
    const dow = new Date().getDay() === 0 ? 7 : new Date().getDay(); // 1=Mon..7=Sun
    Promise.allSettled([
      tasksApi.getWeek(),
      assignedApi.getAssigned(),
      calendarApi.getEvents(iso, iso),
    ]).then(([wk, asg, ev]) => {
      if (wk.status === 'fulfilled') setTasks(wk.value.filter((x) => x.dayOfWeek === dow));
      if (asg.status === 'fulfilled') setAssigned(asg.value);
      if (ev.status === 'fulfilled') setEvents(ev.value);
      setLoading(false);
    });
  }, []);

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const isDone = (x: Task) => x.completions?.[0]?.status === 'DONE';
  const empty = !loading && tasks.length === 0 && assigned.length === 0 && events.length === 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-fg">{t('today.title')}</h1>
        <p className="text-muted text-sm capitalize">{dateLabel}</p>
      </div>

      {loading && <p className="text-muted text-sm">{t('common.loading')}</p>}
      {empty && (
        <div className="text-center py-16 text-muted">{t('today.empty')}</div>
      )}

      {events.length > 0 && (
        <Section title={t('today.events')}>
          {events.map((e) => (
            <Row key={e.id} onClick={() => navigate('/calendar')}
              left={<Dot color={e.color || '#3b82f6'} />}
              title={e.title}
              right={e.isAllDay ? t('today.allDay') : e.startTime} />
          ))}
        </Section>
      )}

      {tasks.length > 0 && (
        <Section title={t('today.myTasks')}>
          {tasks.map((x) => (
            <Row key={x.id} onClick={() => navigate('/')}
              left={<span className="text-base">{x.category?.icon || '•'}</span>}
              title={x.title}
              strike={isDone(x)}
              right={x.reminderTime || undefined} />
          ))}
        </Section>
      )}

      {assigned.length > 0 && (
        <Section title={t('today.assigned')}>
          {assigned.map((x) => (
            <Row key={x.id} onClick={() => navigate(`/projects/${x.project.id}/board`)}
              left={<Dot color={x.project.color || '#3b82f6'} />}
              title={x.title}
              right={x.taskKey || x.columnName} />
          ))}
        </Section>
      )}

      {/* Board-ul de birou (își aduce singur datele). */}
      <OfficeBoard />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-muted mb-2">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ left, title, right, strike, onClick }: {
  left: React.ReactNode; title: string; right?: string; strike?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border hover:bg-elevated transition-colors text-left">
      <span className="flex-shrink-0 w-6 flex items-center justify-center">{left}</span>
      <span className={`flex-1 min-w-0 truncate text-sm text-fg ${strike ? 'line-through opacity-60' : ''}`}>{title}</span>
      {right && <span className="text-[11px] text-muted flex-shrink-0">{right}</span>}
    </button>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />;
}
