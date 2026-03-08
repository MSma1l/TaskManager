interface CategoryBadgeProps {
  icon: string;
  name: string;
  color: string;
}

export default function CategoryBadge({ icon, name, color }: CategoryBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: color + '33', borderColor: color, borderWidth: 1 }}
    >
      <span>{icon}</span>
      <span>{name}</span>
    </span>
  );
}
