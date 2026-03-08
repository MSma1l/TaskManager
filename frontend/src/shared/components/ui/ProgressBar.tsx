interface ProgressBarProps {
  percentage: number;
  color?: string;
}

export default function ProgressBar({ percentage, color = '#3B82F6' }: ProgressBarProps) {
  return (
    <div className="w-full bg-slate-700 rounded-full h-2.5">
      <div
        className="h-2.5 rounded-full transition-all duration-500"
        style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}
