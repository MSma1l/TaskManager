import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import { useNotifications } from '../../hooks/useNotifications';
import Tour from '../tour/Tour';
import { authApi, MeResponse } from '../../../features/auth/api/auth';
import ForcedSetupModal from '../../../features/auth/components/ForcedSetupModal';

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
        // Force setup if missing essentials (PIN + full name)
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
    <div className="min-h-screen bg-bg text-fg pb-20 md:pb-20">
      <Outlet />
      <BottomNav />
      <Tour />
      {needsSetup && me && <ForcedSetupModal me={me} onDone={handleSetupDone} />}
    </div>
  );
}
