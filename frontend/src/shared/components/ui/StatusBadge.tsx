import { STATUS_COLORS, STATUS_LABELS } from '../../utils/constants';

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white ${STATUS_COLORS[status] || 'bg-gray-500'}`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}
