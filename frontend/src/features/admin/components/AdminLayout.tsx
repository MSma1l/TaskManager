import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { adminApi } from '../api/admin';

export default function AdminLayout() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  // Refresh pending count whenever the route changes (admin opens dashboard / requests etc.)
  useEffect(() => {
    let cancelled = false;
    adminApi.listAccessRequests('PENDING')
      .then((rows) => { if (!cancelled) setPendingCount(rows.length); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/admin_task_manager', { replace: true });
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
      isActive ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 bg-slate-800/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center font-bold">A</div>
            <div>
              <h1 className="font-semibold leading-tight">Admin · Task Manager</h1>
              <p className="text-xs text-slate-400 leading-tight">{username || 'admin'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-400 hover:text-white"
          >
            Iesire
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 pb-3 flex gap-2 flex-wrap">
          <NavLink to="/admin_task_manager/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/admin_task_manager/users" className={linkClass}>Utilizatori</NavLink>
          <NavLink to="/admin_task_manager/requests" className={linkClass}>
            Cereri
            {pendingCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-slate-900 text-xs font-semibold">
                {pendingCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/admin_task_manager/stats" className={linkClass}>Statistici</NavLink>
          <NavLink to="/" className={linkClass} end>App utilizator</NavLink>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
