import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../features/auth/hooks/useAuth';
import LoginPage from '../features/auth/pages/LoginPage';
import AdminLoginPage from '../features/auth/pages/AdminLoginPage';
import RequestAccessPage from '../features/auth/pages/RequestAccessPage';
import WeekPage from '../features/tasks/pages/WeekPage';
import StatsPage from '../features/stats/pages/StatsPage';
import ProjectsPage from '../features/projects/pages/ProjectsPage';
import ProjectDetailPage from '../features/projects/pages/ProjectDetailPage';
import NotebookPage from '../features/notebook/pages/NotebookPage';
import CalendarPage from '../features/calendar/pages/CalendarPage';
import ProfilePage from '../features/profile/pages/ProfilePage';
import AppLayout from '../shared/components/layout/AppLayout';
import AdminLayout from '../features/admin/components/AdminLayout';
import AdminDashboardPage from '../features/admin/pages/AdminDashboardPage';
import AdminUsersPage from '../features/admin/pages/AdminUsersPage';
import AdminStatsPage from '../features/admin/pages/AdminStatsPage';
import AdminRequestsPage from '../features/admin/pages/AdminRequestsPage';

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/request-access" element={<RequestAccessPage />} />

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
        <Route path="stats" element={<StatsPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="notebook" element={<NotebookPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
