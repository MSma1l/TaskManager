import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useT } from '../../../shared/i18n/I18nProvider';
import { ProjectWithTasks, projectsApi, UpdateProjectData } from '../api/projects';
import { Task, CreateTaskData } from '../../tasks/api/tasks';
import { tasksApi } from '../../tasks/api/tasks';
import TaskCard from '../../tasks/components/TaskCard';
import MarkTaskModal from '../../tasks/components/MarkTaskModal';
import AddTaskModal from '../../tasks/components/AddTaskModal';
import EditTaskModal from '../../tasks/components/EditTaskModal';
import MembersBar from '../components/MembersBar';
import BoardPage from './BoardPage';
import SprintPlanningBoard from '../components/SprintPlanningBoard';
import SprintsPanel from '../components/SprintsPanel';
import PerformancePanel from '../components/PerformancePanel';
import ActivityPanel from '../components/ActivityPanel';

type ProjectTab = 'list' | 'board' | 'backlog' | 'sprints' | 'performance' | 'activity';

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const isBoardRoute = location.pathname.endsWith('/board');
  // Board is route-backed (deep-linkable); the rest are local. Landing-ul
  // implicit al proiectului e BACKLOG (planificare prin drag&drop).
  const [extraTab, setExtraTab] = useState<'list' | 'backlog' | 'sprints' | 'performance' | 'activity' | null>(null);
  const tab: ProjectTab = isBoardRoute ? 'board' : (extraTab ?? 'backlog');
  const [project, setProject] = useState<ProjectWithTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editGithub, setEditGithub] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editKey, setEditKey] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await projectsApi.getOne(projectId);
      setProject(data);
    } catch {
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  }, [projectId, navigate]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  const handleAddTask = async (data: CreateTaskData & { isRecurring: boolean }) => {
    await tasksApi.create({ ...data, projectId: projectId });
    fetchProject();
  };

  const handleDeleteTask = async (taskId: string) => {
    await tasksApi.delete(taskId);
    fetchProject();
  };

  const handleTaskDone = () => {
    setSelectedTask(null);
    fetchProject();
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(null);
    setEditTask(task);
  };

  const handleEditTaskSave = async (taskId: string, data: Partial<CreateTaskData>) => {
    await tasksApi.update(taskId, data);
    fetchProject();
  };

  const handleSaveEdit = async () => {
    if (!projectId || !editName.trim()) return;
    const data: UpdateProjectData = {
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      githubUrl: editGithub.trim() || undefined,
      color: editColor,
      key: editKey.trim() || undefined,
    };
    await projectsApi.update(projectId, data);
    setShowEdit(false);
    fetchProject();
  };

  const handleDelete = async () => {
    if (!projectId) return;
    await projectsApi.delete(projectId);
    navigate('/projects');
  };

  const openEdit = () => {
    if (!project) return;
    setEditName(project.name);
    setEditDesc(project.description || '');
    setEditGithub(project.githubUrl || '');
    setEditColor(project.color);
    setEditKey(project.key || '');
    setShowEdit(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) return null;

  const doneTasks = project.tasks.filter((t) => t.completions?.[0]?.status === 'DONE');
  const pendingTasks = project.tasks.filter((t) => t.completions?.[0]?.status !== 'DONE');

  return (
    <div className="px-4 pt-5 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/projects')}
          className="text-sm text-slate-400 hover:text-white transition-colors mb-3 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('projects.backToProjects')}
        </button>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
                {project.key && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400">
                    {project.key}
                  </span>
                )}
              </div>
              {project.description && (
                <p className="text-sm text-slate-400 mt-1">{project.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {projectId && tab === 'list' && <MembersBar projectId={projectId} myRole={project.role} />}
            {project.githubUrl && (
              <a
                href={project.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-sm transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </a>
            )}
            <button
              onClick={openEdit}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-sm transition-all duration-200"
            >
              {t('projects.edit')}
            </button>
            {tab === 'list' && (
              <button
                onClick={() => setShowAddTask(true)}
                className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-sm font-semibold transition-all duration-200 shadow-lg shadow-green-600/20"
              >
                {t('projects.addTask')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs: List | Board | Backlog | Sprints | Performance */}
      <div className="flex items-center gap-1 mb-6 border-b border-border overflow-x-auto">
        <button
          onClick={() => { setExtraTab(null); if (isBoardRoute) navigate(`/projects/${projectId}`); }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
            tab === 'backlog' ? 'border-blue-500 text-fg' : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {t('pm.backlog')}
        </button>
        <button
          onClick={() => { setExtraTab(null); navigate(`/projects/${projectId}/board`); }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
            tab === 'board' ? 'border-blue-500 text-fg' : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {t('board.board')}
        </button>
        <button
          onClick={() => { setExtraTab('list'); if (isBoardRoute) navigate(`/projects/${projectId}`); }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
            tab === 'list' ? 'border-blue-500 text-fg' : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {t('board.list')}
        </button>
        <button
          onClick={() => { setExtraTab('sprints'); if (isBoardRoute) navigate(`/projects/${projectId}`); }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
            tab === 'sprints' ? 'border-blue-500 text-fg' : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {t('pm.sprints')}
        </button>
        <button
          onClick={() => { setExtraTab('performance'); if (isBoardRoute) navigate(`/projects/${projectId}`); }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
            tab === 'performance' ? 'border-blue-500 text-fg' : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {t('pm.performance')}
        </button>
        <button
          onClick={() => { setExtraTab('activity'); if (isBoardRoute) navigate(`/projects/${projectId}`); }}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
            tab === 'activity' ? 'border-blue-500 text-fg' : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {t('collab.activityFeed')}
        </button>
      </div>

      {tab === 'board' ? (
        projectId && <BoardPage projectId={projectId} myRole={project.role} />
      ) : tab === 'backlog' ? (
        projectId && <SprintPlanningBoard projectId={projectId} myRole={project.role} />
      ) : tab === 'sprints' ? (
        projectId && <SprintsPanel projectId={projectId} myRole={project.role} />
      ) : tab === 'performance' ? (
        projectId && <PerformancePanel projectId={projectId} />
      ) : tab === 'activity' ? (
        projectId && <ActivityPanel projectId={projectId} />
      ) : (
      <>
      {/* Stats bar */}
      <div className="flex gap-4 mb-6">
        <div className="px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700/40">
          <p className="text-xs text-slate-500">{t('projects.total')}</p>
          <p className="text-lg font-bold">{project.tasks.length}</p>
        </div>
        <div className="px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700/40">
          <p className="text-xs text-slate-500">{t('projects.pending')}</p>
          <p className="text-lg font-bold text-blue-400">{pendingTasks.length}</p>
        </div>
        <div className="px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700/40">
          <p className="text-xs text-slate-500">{t('projects.completed')}</p>
          <p className="text-lg font-bold text-green-400">{doneTasks.length}</p>
        </div>
      </div>

      {/* Tasks */}
      {project.tasks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400 mb-2">{t('projects.noTasksInProject')}</p>
          <p className="text-sm text-slate-500">{t('projects.noTasksHint')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {project.tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={setSelectedTask} />
          ))}
        </div>
      )}
      </>
      )}

      {/* Modals */}
      {showAddTask && (
        <AddTaskModal
          onClose={() => setShowAddTask(false)}
          onSubmit={handleAddTask}
          defaultProjectId={projectId}
        />
      )}

      {selectedTask && (
        <MarkTaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onDone={handleTaskDone}
          onDelete={handleDeleteTask}
          onEdit={handleEditTask}
        />
      )}

      {editTask && (
        <EditTaskModal
          task={editTask}
          onClose={() => { setEditTask(null); fetchProject(); }}
          onSave={handleEditTaskSave}
        />
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowEdit(false)}>
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{t('projects.editProject')}</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-sm text-slate-300 mb-1 block">{t('projects.name')}</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1 block">{t('board.projectKey')}</label>
                <input
                  type="text"
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6))}
                  placeholder={t('board.projectKeyHint')}
                  maxLength={6}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors font-mono uppercase tracking-wide"
                />
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1 block">{t('projects.description')}</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1 block">{t('projects.githubUrl')}</label>
                <input
                  type="url"
                  value={editGithub}
                  onChange={(e) => setEditGithub(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-1 block">{t('projects.color')}</label>
                <div className="flex gap-2">
                  {['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditColor(c)}
                      className={`w-8 h-8 rounded-full transition-all ${editColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 mt-1">
                <button onClick={() => setShowEdit(false)} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 font-semibold transition-colors">
                  {t('projects.cancel')}
                </button>
                <button onClick={handleSaveEdit} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold transition-all duration-200 shadow-lg shadow-blue-600/20">
                  {t('projects.save')}
                </button>
              </div>

              <div className="border-t border-slate-700 mt-2 pt-3">
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-red-400/60 hover:text-red-400 text-sm transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {t('projects.deleteProject')}
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-red-400">{t('projects.deleteConfirm')}</span>
                    <button onClick={handleDelete} className="text-sm text-red-400 font-bold hover:text-red-300">{t('projects.deleteYes')}</button>
                    <button onClick={() => setConfirmDelete(false)} className="text-sm text-slate-400 hover:text-white">{t('projects.deleteNo')}</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
