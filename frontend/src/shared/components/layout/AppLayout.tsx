import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import { useNotifications } from '../../hooks/useNotifications';
import Tour from '../tour/Tour';
import { authApi, MeResponse } from '../../../features/auth/api/auth';
import ForcedSetupModal from '../../../features/auth/components/ForcedSetupModal';
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
        // Notificarile au fost mutate in sidebar / bara de jos, deci nu mai e
        // nevoie de marja suplimentara sus pentru clopotelul flotant.
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)',
      }}
    >
      <Sidebar />
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
