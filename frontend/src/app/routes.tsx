import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../features/auth/hooks/useAuth';
import LoginPage from '../features/auth/pages/LoginPage';
import WeekPage from '../features/tasks/pages/WeekPage';
import StatsPage from '../features/stats/pages/StatsPage';
import ProjectsPage from '../features/projects/pages/ProjectsPage';
import ProjectDetailPage from '../features/projects/pages/ProjectDetailPage';
import AppLayout from '../shared/components/layout/AppLayout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
