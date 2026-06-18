import { useState, useEffect, useCallback } from 'react';
import { Project, ProjectStatus, CreateProjectData, UpdateProjectData, projectsApi } from '../api/projects';

export function useProjects(statuses?: ProjectStatus[]) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Serializăm filtrul ca să avem o dependență stabilă pentru useCallback/useEffect.
  const statusKey = statuses && statuses.length ? statuses.join(',') : '';

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const filter = statusKey ? (statusKey.split(',') as ProjectStatus[]) : undefined;
      const data = await projectsApi.getAll(filter);
      setProjects(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusKey]);

  useEffect(() => { fetch(); }, [fetch]);

  // Reîmprospătează lista când userul revine în tab + polling ușor, ca un
  // proiect în care tocmai a fost adăugat să apară fără refresh manual.
  useEffect(() => {
    const onFocus = () => fetch();
    const onVisible = () => { if (document.visibilityState === 'visible') fetch(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(fetch, 20000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(id);
    };
  }, [fetch]);

  const createProject = async (data: CreateProjectData) => {
    const project = await projectsApi.create(data);
    // Re-fetch în loc de prepend local, ca filtrul curent să rămână corect.
    fetch();
    return project;
  };

  const updateProject = async (id: string, data: UpdateProjectData) => {
    const project = await projectsApi.update(id, data);
    // Schimbarea statusului poate scoate proiectul din filtrul curent, deci re-fetch.
    fetch();
    return project;
  };

  const deleteProject = async (id: string) => {
    await projectsApi.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return { projects, loading, refetch: fetch, createProject, updateProject, deleteProject };
}
