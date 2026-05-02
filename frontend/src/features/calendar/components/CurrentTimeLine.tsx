import { useEffect, useState } from 'react';

export default function CurrentTimeLine({ hourHeight }: { hourHeight: number }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const mins = now.getHours() * 60 + now.getMinutes();
  const top = (mins / 60) * hourHeight;

  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2 h-2 bg-red-500 rounded-full -ml-1" />
        <div className="flex-1 border-t-2 border-red-500" />
      </div>
    </div>
  );
}
