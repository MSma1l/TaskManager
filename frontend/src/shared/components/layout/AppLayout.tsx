import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
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
      className="min-h-screen bg-bg text-fg md:pl-60"
      style={{
        // Reserve enough space for the BottomNav (mobile) + iPhone home indicator.
        // Pe desktop bara de jos e ascunsa, dar pastram safe-area-ul.
        // Pe mobil adaugam ~3.5rem in plus ca headerele/primele iteme sa nu fie
        // acoperite de clopotelul de notificari (fixed top-right, z-40). Pe
        // desktop sidebar-ul lasa loc, deci nu mai e nevoie de spatiu extra.
        paddingTop:
          'calc(env(safe-area-inset-top, 0px) + var(--app-bell-clearance, 0px))',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)',
      }}
    >
      <Sidebar />
      <NotificationBell />
      <CommandPalette />
      <QuickAddFab />
      <Outlet />
      <div className="md:hidden">
        <BottomNav />
      </div>
      <Tour />
      {needsSetup && me && <ForcedSetupModal me={me} onDone={handleSetupDone} />}
    </div>
  );
}
