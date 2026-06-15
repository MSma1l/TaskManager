import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { CreateProjectData } from '../api/projects';

/** Build an uppercase A-Z key suggestion from a free-text project name. */
function suggestKey(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let raw: string;
  if (words.length >= 2) {
    raw = words.map((w) => w[0]).join('');
  } else {
    raw = name;
  }
  return raw.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6);
}

const COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
];

interface AddProjectModalProps {
  onClose: () => void;
  onSubmit: (data: CreateProjectData) => Promise<unknown>;
}

export default function AddProjectModal({ onClose, onSubmit }: AddProjectModalProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [key, setKey] = useState('');
  /** Once the user edits the key manually, stop auto-suggesting from the name. */
  const [keyTouched, setKeyTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleNameChange = (value: string) => {
    setName(value);
    setError('');
    if (!keyTouched) setKey(suggestKey(value));
  };

  const handleKeyChange = (value: string) => {
    setKeyTouched(true);
    setKey(value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6));
  };

  const handleSubmit = async () => {
    if (!name.trim() || name.trim().length < 2) {
      setError('Numele trebuie sa aiba minim 2 caractere');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        githubUrl: githubUrl.trim() || undefined,
        color,
        key: key.trim() || undefined,
      });
      onClose();
    } catch {
      setError('Eroare la salvare');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">Proiect Nou</h3>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-sm text-slate-300 mb-1 block">Nume *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Numele proiectului..."
              maxLength={100}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-sm text-slate-300 mb-1 block">{t('board.projectKey')}</label>
            <input
              type="text"
              value={key}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder={t('board.projectKeyHint')}
              maxLength={6}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors font-mono uppercase tracking-wide"
            />
          </div>

          <div>
            <label className="text-sm text-slate-300 mb-1 block">Descriere</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Despre ce este proiectul..."
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="text-sm text-slate-300 mb-1 block">Link GitHub</label>
            <input
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-sm text-slate-300 mb-1 block">Culoare</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all duration-200 ${
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

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
