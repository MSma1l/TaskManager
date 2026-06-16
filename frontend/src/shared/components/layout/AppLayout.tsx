import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import { useNotifications } from '../../hooks/useNotifications';
import Tour from '../tour/Tour';
import { authApi, MeResponse } from '../../../features/auth/api/auth';
import ForcedSetupModal from '../../../features/auth/components/ForcedSetupModal';
import NotificationBell from '../../../features/notifications/components/NotificationBell';
import CommandPalette from '../search/CommandPalette';
import QuickAddFab from '../quickadd/QuickAddFab';

export default function AppLayout() {
  useNotifications();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    let alive = true;
    authApi.me()
      .then((data) => {
        if (!alive) return;
        setMe(data);
        if (!data.hasPin || !data.fullName) {
          setNeedsSetup(true);
        }
      })
      .catch(() => { /* 401 will trigger redirect via client interceptor */ });
    return () => { alive = false; };
  }, []);

  const handleSetupDone = (updated: MeResponse) => {
    setMe(updated);
    setNeedsSetup(false);
  };

  return (
    <div
      className="min-h-screen bg-bg text-fg"
      style={{
        // Reserve enough space for the BottomNav + iPhone home indicator
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)',
      }}
    >
      <NotificationBell />
      <CommandPalette />
      <QuickAddFab />
      <Outlet />
      <BottomNav />
      <Tour />
      {needsSetup && me && <ForcedSetupModal me={me} onDone={handleSetupDone} />}
    </div>
  );
}
