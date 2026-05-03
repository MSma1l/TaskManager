import { useState, useEffect } from 'react';
import { Category } from '../api/tasks';
import { categoriesApi } from '../api/categories';
import { Project, projectsApi } from '../../projects/api/projects';
import { DAYS_RO } from '../../../shared/utils/constants';
import { formatISO, getDayOfWeek } from '../../../shared/utils/dates';
import { useLocalDraft } from '../../../shared/hooks/useLocalDraft';

const DRAFT_KEY = 'add-task-modal';
interface TaskDraft { title: string; description: string; categoryId: string; projectId: string; }

interface AddTaskModalProps {
  defaultDate?: Date;
  defaultProjectId?: string;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description?: string;
    categoryId: string;
    dayOfWeek: number;
    reminderTime?: string;
    isRecurring: boolean;
    scheduledDate?: string;
    priority?: string;
    estimatedMinutes?: number;
    projectId?: string;
  }) => void;
}

export default function AddTaskModal({ defaultDate, defaultProjectId, onClose, onSubmit }: AddTaskModalProps) {
  const defaultDayOfWeek = defaultDate ? getDayOfWeek(defaultDate) : undefined;
  const defaultDateISO = defaultDate ? formatISO(defaultDate) : '';

  const [draft, setDraft, clearDraft] = useLocalDraft<TaskDraft>(DRAFT_KEY, {
    title: '', description: '', categoryId: '', projectId: '',
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState(draft.title);
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState(draft.description);
  const [categoryId, setCategoryId] = useState(draft.categoryId);
  const [projectId, setProjectId] = useState(defaultProjectId || draft.projectId || '');
  const [selectedDays, setSelectedDays] = useState<number[]>(defaultDayOfWeek ? [defaultDayOfWeek] : []);
  const [daysTouched, setDaysTouched] = useState(!!defaultDayOfWeek);
  const [reminderTime, setReminderTime] = useState('');
  const [useReminder, setUseReminder] = useState(false);
  const [isRecurring, setIsRecurring] = useState(true);
  const [priority, setPriority] = useState('MEDIUM');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    categoriesApi.getAll().then(setCategories).catch(() => {});
    projectsApi.getAll().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  // Live-save the form so a typed title/description survives reload
  useEffect(() => {
    setDraft({ title, description, categoryId, projectId });
  }, [setDraft, title, description, categoryId, projectId]);

  const toggleDay = (day: number) => {
    setDaysTouched(true);
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const validate = (): string | null => {
    if (!title.trim()) return 'Titlul este obligatoriu';
    if (title.trim().length < 3) return 'Titlul trebuie sa aiba minim 3 caractere';
    if (title.trim().length > 100) return 'Titlul nu poate avea mai mult de 100 caractere';
    if (!categoryId) return 'Selecteaza o categorie';
    if (isRecurring && selectedDays.length === 0) return 'Selecteaza cel putin o zi';
    if (useReminder && !reminderTime) return 'Selecteaza ora pentru reminder';
    return null;
  };

  const handleSubmit = async () => {
    setTitleTouched(true);
    setDaysTouched(true);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (!isRecurring && defaultDayOfWeek) {
        // Non-recurring: use the date from the day column that was clicked
        await onSubmit({
          title: title.trim(),
          description: description.trim() || undefined,
          categoryId,
          dayOfWeek: defaultDayOfWeek,
          reminderTime: useReminder && reminderTime ? reminderTime : undefined,
          isRecurring: false,
          scheduledDate: defaultDateISO,
          priority,
          estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
          projectId: projectId || undefined,
        });
      } else {
        for (const day of selectedDays) {
          await onSubmit({
            title: title.trim(),
            description: description.trim() || undefined,
            categoryId,
            dayOfWeek: day,
            reminderTime: useReminder && reminderTime ? reminderTime : undefined,
            isRecurring,
            priority,
            estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
            projectId: projectId || undefined,
          });
        }
      }
      clearDraft();
      onClose();
    } catch {
      setError('Eroare la salvare. Incearca din nou.');
    } finally {
      setLoading(false);
    }
  };

  const titleError = titleTouched && (!title.trim() || title.trim().length < 3);
  const daysError = daysTouched && selectedDays.length === 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-2xl p-6 w-full max-w-2xl border border-slate-700 max-h-[95vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">Adauga Task Nou</h3>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* Row 1: Title + Description side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-300 mb-1 block">Titlu *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); setError(''); }}
                placeholder="Numele taskului..."
                maxLength={100}
                className={`w-full px-3 py-2 rounded-lg bg-slate-700 border outline-none transition-colors ${
                  titleError ? 'border-red-500 focus:border-red-400' : 'border-slate-600 focus:border-blue-500'
                }`}
              />
              {titleError && <p className="text-xs text-red-400 mt-1">Minim 3 caractere</p>}
            </div>
            <div>
              <label className="text-sm text-slate-300 mb-1 block">Descriere</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalii despre task..."
                maxLength={500}
                className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Row 2: Category */}
          <div>
            <label className="text-sm text-slate-300 mb-1 block">Categorie *</label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setCategoryId(cat.id); setError(''); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all duration-200 ${
                    categoryId === cat.id
                      ? 'border-blue-500 bg-blue-500/20 shadow-sm shadow-blue-500/10'
                      : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Row 2.5: Project */}
          {projects.length > 0 && (
            <div>
              <label className="text-sm text-slate-300 mb-1 block">Proiect</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setProjectId('')}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-all duration-200 ${
                    !projectId
                      ? 'border-blue-500 bg-blue-500/20'
                      : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                  }`}
                >
                  Fara proiect
                </button>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProjectId(p.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all duration-200 ${
                      projectId === p.id
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Row 3: Priority + Duration side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-300 mb-1 block">Prioritate</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { value: 'LOW', label: 'Mica', color: 'border-slate-500 bg-slate-700/50 text-slate-300', active: 'border-slate-400 bg-slate-600 text-white' },
                  { value: 'MEDIUM', label: 'Medie', color: 'border-blue-500/30 bg-slate-700/50 text-slate-300', active: 'border-blue-500 bg-blue-600/30 text-blue-300' },
                  { value: 'HIGH', label: 'Mare', color: 'border-orange-500/30 bg-slate-700/50 text-slate-300', active: 'border-orange-500 bg-orange-600/30 text-orange-300' },
                  { value: 'URGENT', label: 'Urgent', color: 'border-red-500/30 bg-slate-700/50 text-slate-300', active: 'border-red-500 bg-red-600/30 text-red-300' },
                ].map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPriority(p.value)}
                    className={`py-2 rounded-lg border text-xs font-medium transition-all duration-200 ${
                      priority === p.value ? p.active : p.color
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-300 mb-1 block">Durata estimata</label>
              <div className="flex gap-1.5">
                {['15', '30', '60', '120'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setEstimatedMinutes(estimatedMinutes === m ? '' : m)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all duration-200 ${
                      estimatedMinutes === m
                        ? 'border-blue-500 bg-blue-600/30 text-blue-300'
                        : 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {parseInt(m) >= 60 ? `${parseInt(m) / 60}h` : `${m}m`}
                  </button>
                ))}
                <input
                  type="number"
                  value={!['15', '30', '60', '120'].includes(estimatedMinutes) ? estimatedMinutes : ''}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
                  placeholder="Alt"
                  min={1}
                  max={480}
                  className="w-14 px-2 py-2 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 text-xs text-center transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Recurring + Reminder side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-300">Repetabil saptamanal</label>
                <button
                  onClick={() => setIsRecurring(!isRecurring)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    isRecurring ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    isRecurring ? 'translate-x-7' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {!isRecurring && defaultDateISO && (
                <p className="text-xs text-blue-400 mt-1.5">
                  Task pentru {defaultDateISO.split('-').reverse().join('.')}
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-300">Reminder</label>
                <button
                  onClick={() => setUseReminder(!useReminder)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    useReminder ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    useReminder ? 'translate-x-7' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {useReminder && (
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="w-full px-3 py-2 mt-1.5 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors"
                />
              )}
            </div>
          </div>

          {/* Days - only show for recurring tasks */}
          {isRecurring && <div>
            <label className={`text-sm mb-1 block ${daysError ? 'text-red-400' : 'text-slate-300'}`}>
              Zi(le) * {daysError && '- selecteaza cel putin o zi'}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_RO.map((name, i) => (
                <button
                  key={i}
                  onClick={() => { toggleDay(i + 1); setError(''); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    selectedDays.includes(i + 1)
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>}

          {/* Actions */}
          <div className="flex gap-3 mt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 font-semibold transition-colors">
              Anuleaza
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-blue-600/20"
            >
              {loading ? 'Se salveaza...' : 'Adauga'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
