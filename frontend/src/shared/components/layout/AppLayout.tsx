import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import { useNotifications } from '../../hooks/useNotifications';

export default function AppLayout() {
  useNotifications();

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}
