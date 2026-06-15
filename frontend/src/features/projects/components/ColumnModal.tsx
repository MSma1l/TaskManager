import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { BoardColumn, ColumnType, CreateColumnData, UpdateColumnData } from '../api/board';
import { BOARD_COLORS, COLUMN_TYPES, columnTypeKey } from './boardConstants';

interface ColumnModalProps {
  /** When provided, the modal is in edit mode. */
  column?: BoardColumn | null;
  onClose: () => void;
  onCreate?: (data: CreateColumnData) => Promise<unknown>;
  onUpdate?: (columnId: string, data: UpdateColumnData) => Promise<unknown>;
}

export default function ColumnModal({ column, onClose, onCreate, onUpdate }: ColumnModalProps) {
  const t = useT();
  const isEdit = !!column;
  const [name, setName] = useState(column?.name || '');
  const [color, setColor] = useState(column?.color || BOARD_COLORS[0]);
  const [columnType, setColumnType] = useState<ColumnType>(column?.columnType || 'CUSTOM');
  const [isDone, setIsDone] = useState(column?.isDoneColumn || false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t('common.error'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isEdit && column && onUpdate) {
        await onUpdate(column.id, { name: name.trim(), color, isDoneColumn: isDone, columnType });
      } else if (onCreate) {
        await onCreate({ name: name.trim(), color, columnType });
      }
      onClose();
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-elevated rounded-2xl p-6 w-full max-w-sm border border-border"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4 text-fg">
          {isEdit ? t('board.editColumn') : t('board.addColumn')}
        </h3>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-sm text-fg mb-1 block">{t('board.columnName')}</label>
            <input
              type="text"
              value={name}
              autoFocus
              onChange={(e) => { setName(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              maxLength={50}
              className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-sm text-fg mb-1 block">{t('board.columnType')}</label>
            <select
              value={columnType}
              onChange={(e) => setColumnType(e.target.value as ColumnType)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-fg outline-none focus:border-blue-500 transition-colors"
            >
              {COLUMN_TYPES.map((ct) => (
                <option key={ct} value={ct}>{t(columnTypeKey(ct))}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-fg mb-1 block">{t('board.color')}</label>
            <div className="flex flex-wrap gap-2">
              {BOARD_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all duration-200 ${
                    color === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-elevated scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none mt-1">
              <input
                type="checkbox"
                checked={isDone}
                onChange={(e) => setIsDone(e.target.checked)}
                className="w-4 h-4 rounded accent-green-500"
              />
              <span className="text-sm text-fg">{t('board.doneColumn')}</span>
            </label>
          )}

          <div className="flex gap-3 mt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg border border-border text-fg font-semibold transition-colors">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-blue-600/20"
            >
              {loading ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
