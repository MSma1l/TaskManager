import { useState, useEffect, useCallback } from 'react';
import { Project, CreateProjectData, projectsApi } from '../api/projects';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projectsApi.getAll();
      setProjects(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const createProject = async (data: CreateProjectData) => {
    const project = await projectsApi.create(data);
    setProjects((prev) => [project, ...prev]);
    return project;
  };

  const deleteProject = async (id: string) => {
    await projectsApi.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return { projects, loading, refetch: fetch, createProject, deleteProject };
}
