import { useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { Label, CreateLabelData } from '../api/board';
import { BOARD_COLORS } from './boardConstants';

interface LabelPickerProps {
  labels: Label[];
  selected: string[];
  onToggle: (labelId: string) => void;
  onCreateLabel?: (data: CreateLabelData) => Promise<Label>;
}

export default function LabelPicker({ labels, selected, onToggle, onCreateLabel }: LabelPickerProps) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(BOARD_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !onCreateLabel) return;
    setSaving(true);
    try {
      const label = await onCreateLabel({ name: name.trim(), color });
      onToggle(label.id);
      setName('');
      setAdding(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {labels.map((l) => {
          const active = selected.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onToggle(l.id)}
              className={`text-xs font-semibold px-2 py-1 rounded-md transition-all ${active ? 'ring-2 ring-offset-1 ring-offset-elevated' : 'opacity-60 hover:opacity-100'}`}
              style={{
                backgroundColor: `${l.color}22`,
                color: l.color,
                // @ts-expect-error CSS custom prop for ring color
                '--tw-ring-color': l.color,
              }}
            >
              {l.name}
            </button>
          );
        })}
        {onCreateLabel && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs px-2 py-1 rounded-md border border-dashed border-border text-muted hover:text-fg transition-colors"
          >
            + {t('board.addLabel')}
          </button>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-surface border border-border">
          <input
            type="text"
            value={name}
            autoFocus
            placeholder={t('board.addLabel')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            maxLength={30}
            className="flex-1 min-w-0 px-2 py-1 rounded-md bg-bg border border-border text-fg text-sm outline-none focus:border-blue-500"
          />
          <div className="flex gap-1">
            {BOARD_COLORS.slice(0, 6).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full ${color === c ? 'ring-2 ring-fg' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="text-xs px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
          >
            {t('common.add')}
          </button>
        </div>
      )}
    </div>
  );
}
