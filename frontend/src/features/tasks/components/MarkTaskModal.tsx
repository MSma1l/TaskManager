import { useState } from 'react';
import { Task } from '../api/tasks';
import { completionsApi } from '../api/completions';

interface MarkTaskModalProps {
  task: Task;
  onClose: () => void;
  onDone: () => void;
  onDelete?: (taskId: string) => Promise<void>;
}

export default function MarkTaskModal({ task, onClose, onDone, onDelete }: MarkTaskModalProps) {
  const completion = task.completions?.[0];
  const currentStatus = completion?.status || 'PENDING';
  const isPending = currentStatus === 'PENDING';

  const [mode, setMode] = useState<'choose' | 'move' | 'notdone' | 'confirmDelete'>('choose');
  const [movedToDate, setMovedToDate] = useState('');
  const [dateError, setDateError] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const handleDone = async () => {
    setLoading(true);
    try {
      await completionsApi.markDone(task.id);
      setSuccess('Marcat ca facut!');
      setTimeout(onDone, 600);
    } catch {
      setLoading(false);
    }
  };

  const validateMoveDate = (val: string) => {
    setMovedToDate(val);
    if (!val) {
      setDateError('Selecteaza o data');
      return;
    }
    const selected = new Date(val);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selected < today) {
      setDateError('Data trebuie sa fie in viitor');
      return;
    }
    setDateError('');
  };

  const handleMove = async () => {
    if (!movedToDate || dateError) return;
    setLoading(true);
    try {
      await completionsApi.moveTask(task.id, movedToDate, note || undefined);
      setSuccess('Task mutat!');
      setTimeout(onDone, 600);
    } catch {
      setLoading(false);
    }
  };

  const handleNotDone = async () => {
    if (reason.trim().length < 10) return;
    setLoading(true);
    try {
      await completionsApi.markNotDone(task.id, reason.trim());
      setSuccess('Task marcat ca nefacut.');
      setTimeout(onDone, 600);
    } catch {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setLoading(true);
    try {
      await onDelete(task.id);
      setSuccess('Task sters!');
      setTimeout(onDone, 600);
    } catch {
      setLoading(false);
    }
  };

  // If task is already marked, show status info
  if (!isPending && mode === 'choose') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-bold mb-1">{task.title}</h3>
          <p className="text-sm text-slate-400 mb-2">
            {task.category.icon} {task.category.name}
          </p>
          {task.description && (
            <p className="text-sm text-slate-300 mb-4 p-3 rounded-lg bg-slate-700/50 border border-slate-600/50">{task.description}</p>
          )}

          <div className={`p-4 rounded-xl mb-4 ${
            currentStatus === 'DONE' ? 'bg-green-900/30 border border-green-500/30' :
            currentStatus === 'SKIPPED' ? 'bg-blue-900/30 border border-blue-500/30' :
            'bg-red-900/30 border border-red-500/30'
          }`}>
            <p className="text-sm font-medium mb-1">
              {currentStatus === 'DONE' && 'Taskul este completat'}
              {currentStatus === 'SKIPPED' && 'Taskul a fost mutat'}
              {currentStatus === 'NOT_DONE' && 'Taskul nu a fost facut'}
            </p>
            {completion?.completedAt && (
              <p className="text-xs text-slate-400">Completat: {new Date(completion.completedAt).toLocaleString('ro-RO')}</p>
            )}
            {completion?.movedToDate && (
              <p className="text-xs text-slate-400">Mutat pe: {new Date(completion.movedToDate).toLocaleDateString('ro-RO')}</p>
            )}
            {completion?.skipReason && (
              <p className="text-xs text-slate-400 mt-1">Motiv: {completion.skipReason}</p>
            )}
            {completion?.note && (
              <p className="text-xs text-slate-400 mt-1">Nota: {completion.note}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 font-semibold transition-colors">
              Inchide
            </button>
            {onDelete && (
              <button
                onClick={handleDelete}
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-red-400 hover:bg-red-900/30 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {loading ? 'Se sterge...' : 'Sterge taskul'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm border border-slate-700 transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Success overlay */}
        {success && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-600/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-green-400">{success}</p>
          </div>
        )}

        {!success && (
          <>
            <h3 className="text-lg font-bold mb-1">{task.title}</h3>
            <p className="text-sm text-slate-400 mb-2">
              {task.category.icon} {task.category.name}
            </p>
            {task.description && (
              <p className="text-sm text-slate-300 mb-4 p-3 rounded-lg bg-slate-700/50 border border-slate-600/50">{task.description}</p>
            )}

            {mode === 'choose' && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleDone}
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-500 font-semibold transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-green-600/20"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Marcat ca Facut
                </button>
                <button
                  onClick={() => setMode('move')}
                  className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold transition-all duration-200 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-600/20"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Muta pe alta zi
                </button>
                <button
                  onClick={() => setMode('notdone')}
                  className="w-full py-3.5 rounded-xl bg-red-600/80 hover:bg-red-600 font-semibold transition-all duration-200 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-red-600/20"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Nu am facut
                </button>
                <div className="border-t border-slate-700 mt-1 pt-3 flex items-center justify-between">
                  <button onClick={onClose} className="text-slate-400 hover:text-white text-sm transition-colors">
                    Anuleaza
                  </button>
                  {onDelete && (
                    <button
                      onClick={() => setMode('confirmDelete')}
                      className="text-red-400/60 hover:text-red-400 text-sm transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Sterge
                    </button>
                  )}
                </div>
              </div>
            )}

            {mode === 'confirmDelete' && (
              <div className="flex flex-col gap-3">
                <div className="p-4 rounded-xl bg-red-900/30 border border-red-500/30">
                  <p className="text-sm font-medium text-red-400 mb-1">Esti sigur ca vrei sa stergi?</p>
                  <p className="text-xs text-slate-400">Taskul &quot;{task.title}&quot; va fi sters definitiv.</p>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 font-semibold transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {loading ? 'Se sterge...' : 'Da, sterge definitiv'}
                </button>
                <button onClick={() => setMode('choose')} className="text-slate-400 hover:text-white text-sm transition-colors">
                  Inapoi
                </button>
              </div>
            )}

            {mode === 'move' && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Noua data *</label>
                  <input
                    type="date"
                    value={movedToDate}
                    onChange={(e) => validateMoveDate(e.target.value)}
                    min={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()}
                    className={`w-full px-4 py-2.5 rounded-lg bg-slate-700 border outline-none transition-colors ${
                      dateError ? 'border-red-500 focus:border-red-400' : 'border-slate-600 focus:border-blue-500'
                    }`}
                  />
                  {dateError && <p className="text-xs text-red-400 mt-1">{dateError}</p>}
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Nota (optional)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Adauga o nota..."
                    maxLength={200}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <button
                  onClick={handleMove}
                  disabled={loading || !movedToDate || !!dateError}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold transition-all duration-200 disabled:opacity-50"
                >
                  {loading ? 'Se muta...' : 'Muta'}
                </button>
                <button onClick={() => { setMode('choose'); setDateError(''); }} className="text-slate-400 hover:text-white text-sm transition-colors">
                  Inapoi
                </button>
              </div>
            )}

            {mode === 'notdone' && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">De ce nu ai facut? *</label>
                  <textarea
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); setReasonTouched(true); }}
                    placeholder="Explica motivul (minim 10 caractere)..."
                    rows={3}
                    maxLength={500}
                    className={`w-full px-4 py-2.5 rounded-lg bg-slate-700 border outline-none transition-colors resize-none ${
                      reasonTouched && reason.trim().length < 10 ? 'border-red-500 focus:border-red-400' : 'border-slate-600 focus:border-blue-500'
                    }`}
                  />
                  <div className="flex justify-between mt-1">
                    <p className={`text-xs ${
                      reason.trim().length >= 10 ? 'text-green-400' : reasonTouched ? 'text-red-400' : 'text-slate-500'
                    }`}>
                      {reason.trim().length}/10 caractere minim
                    </p>
                    <p className="text-xs text-slate-500">{reason.length}/500</p>
                  </div>
                  {reasonTouched && reason.trim().length > 0 && reason.trim().length < 10 && (
                    <p className="text-xs text-red-400 mt-1">Motivul trebuie sa aiba minim 10 caractere</p>
                  )}
                </div>
                <button
                  onClick={handleNotDone}
                  disabled={loading || reason.trim().length < 10}
                  className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 font-semibold transition-all duration-200 disabled:opacity-50"
                >
                  {loading ? 'Se salveaza...' : 'Confirma'}
                </button>
                <button onClick={() => { setMode('choose'); setReasonTouched(false); }} className="text-slate-400 hover:text-white text-sm transition-colors">
                  Inapoi
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
