import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import { useNotifications } from '../../hooks/useNotifications';
import Tour from '../tour/Tour';

export default function AppLayout() {
  useNotifications();

  return (
    <div className="min-h-screen bg-bg text-fg pb-20">
      <Outlet />
      <BottomNav />
      <Tour />
    </div>
  );
}
