import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../features/auth/hooks/useAuth';
import AppLayout from '../shared/components/layout/AppLayout';

// Auth pages are tiny and on the critical login path — keep them eager so users
// don't see a flash of fallback on first paint.
import LoginPage from '../features/auth/pages/LoginPage';
import AdminLoginPage from '../features/auth/pages/AdminLoginPage';

// Everything else is code-split. Heavy deps (recharts on stats, jspdf wherever
// it's used, qrcode on QR pages) get pulled into their own chunks automatically.
const RequestAccessPage = lazy(() => import('../features/auth/pages/RequestAccessPage'));
const QRConfirmPage = lazy(() => import('../features/auth/pages/QRConfirmPage'));
const TelegramAppPage = lazy(() => import('../features/auth/pages/TelegramAppPage'));
const WeekPage = lazy(() => import('../features/tasks/pages/WeekPage'));
const TodayPage = lazy(() => import('../features/tasks/pages/TodayPage'));
const StatsPage = lazy(() => import('../features/stats/pages/StatsPage'));
const ProjectsPage = lazy(() => import('../features/projects/pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('../features/projects/pages/ProjectDetailPage'));
const NotebookPage = lazy(() => import('../features/notebook/pages/NotebookPage'));
const CalendarPage = lazy(() => import('../features/calendar/pages/CalendarPage'));
const ProfilePage = lazy(() => import('../features/profile/pages/ProfilePage'));
const AdminLayout = lazy(() => import('../features/admin/components/AdminLayout'));
const AdminDashboardPage = lazy(() => import('../features/admin/pages/AdminDashboardPage'));
const AdminUsersPage = lazy(() => import('../features/admin/pages/AdminUsersPage'));
const AdminStatsPage = lazy(() => import('../features/admin/pages/AdminStatsPage'));
const AdminRequestsPage = lazy(() => import('../features/admin/pages/AdminRequestsPage'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-fg/60">
      <div className="animate-pulse text-sm">Se încarcă…</div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/admin_task_manager" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/request-access" element={<RequestAccessPage />} />
        <Route path="/qr-confirm/:id" element={<QRConfirmPage />} />
        <Route path="/tg-app" element={<TelegramAppPage />} />

        {/* Admin entry point */}
        <Route path="/admin_task_manager" element={<AdminLoginPage />} />
        <Route
          path="/admin_task_manager/*"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="requests" element={<AdminRequestsPage />} />
          <Route path="stats" element={<AdminStatsPage />} />
        </Route>

        {/* User app */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<WeekPage />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="projects/:projectId/board" element={<ProjectDetailPage />} />
          <Route path="notebook" element={<NotebookPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
