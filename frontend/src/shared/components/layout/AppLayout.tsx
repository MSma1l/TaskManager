import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-900 text-white pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}
