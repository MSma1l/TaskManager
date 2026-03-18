import { useState, useEffect, useCallback } from 'react';
import { notebookApi, Topic, Note } from '../api/notebook';

type Tab = 'time' | 'ideas';
type TimeSubTab = 'steps' | 'tasks';

export default function NotebookPage() {
  const [tab, setTab] = useState<Tab>('time');
  const [timeSubTab, setTimeSubTab] = useState<TimeSubTab>('steps');

  // Steps
  const [steps, setSteps] = useState<Note[]>([]);
  const [newStep, setNewStep] = useState('');

  // Tasks
  const [tasks, setTasks] = useState<Note[]>([]);
  const [newTask, setNewTask] = useState('');
  const [taskFilter, setTaskFilter] = useState<string>('');

  // Ideas
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [ideas, setIdeas] = useState<Note[]>([]);
  const [newIdea, setNewIdea] = useState('');

  // Modals
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [topicForm, setTopicForm] = useState({ name: '', emoji: '', description: '' });

  // Edit
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const [loading, setLoading] = useState(false);

  const fetchSteps = useCallback(async () => {
    const data = await notebookApi.getSteps();
    setSteps(data);
  }, []);

  const fetchTasks = useCallback(async () => {
    const data = await notebookApi.getTasks(taskFilter || undefined);
    setTasks(data);
  }, [taskFilter]);

  const fetchTopics = useCallback(async () => {
    const data = await notebookApi.getTopics();
    setTopics(data);
  }, []);

  const fetchIdeas = useCallback(async (topicId: string) => {
    const data = await notebookApi.getIdeas(topicId);
    setIdeas(data);
  }, []);

  useEffect(() => {
    if (tab === 'time') {
      if (timeSubTab === 'steps') fetchSteps();
      else fetchTasks();
    } else {
      fetchTopics();
    }
  }, [tab, timeSubTab, fetchSteps, fetchTasks, fetchTopics]);

  useEffect(() => {
    if (selectedTopic) fetchIdeas(selectedTopic.id);
  }, [selectedTopic, fetchIdeas]);

  // ── Handlers ──

  const handleAddStep = async () => {
    if (!newStep.trim()) return;
    setLoading(true);
    await notebookApi.addStep(newStep.trim());
    setNewStep('');
    await fetchSteps();
    setLoading(false);
  };

  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    setLoading(true);
    await notebookApi.addTask(newTask.trim());
    setNewTask('');
    await fetchTasks();
    setLoading(false);
  };

  const handleAddIdea = async () => {
    if (!newIdea.trim() || !selectedTopic) return;
    setLoading(true);
    await notebookApi.addIdea(selectedTopic.id, newIdea.trim());
    setNewIdea('');
    await fetchIdeas(selectedTopic.id);
    // Update topic count
    await fetchTopics();
    setLoading(false);
  };

  const handleCreateTopic = async () => {
    if (!topicForm.name.trim()) return;
    setLoading(true);
    await notebookApi.createTopic({
      name: topicForm.name.trim(),
      emoji: topicForm.emoji || undefined,
      description: topicForm.description || undefined,
    });
    setTopicForm({ name: '', emoji: '', description: '' });
    setShowAddTopic(false);
    await fetchTopics();
    setLoading(false);
  };

  const handleDeleteTopic = async (id: string) => {
    await notebookApi.deleteTopic(id);
    if (selectedTopic?.id === id) {
      setSelectedTopic(null);
      setIdeas([]);
    }
    await fetchTopics();
  };

  const handleDeleteNote = async (id: string) => {
    await notebookApi.deleteNote(id);
    if (tab === 'time') {
      if (timeSubTab === 'steps') await fetchSteps();
      else await fetchTasks();
    } else if (selectedTopic) {
      await fetchIdeas(selectedTopic.id);
      await fetchTopics();
    }
  };

  const handleEditSave = async (id: string) => {
    if (!editContent.trim()) return;
    await notebookApi.updateNote(id, { content: editContent.trim() });
    setEditingNote(null);
    setEditContent('');
    if (tab === 'time') {
      if (timeSubTab === 'steps') await fetchSteps();
      else await fetchTasks();
    } else if (selectedTopic) {
      await fetchIdeas(selectedTopic.id);
    }
  };

  const handleTaskStatusChange = async (id: string, status: string) => {
    await notebookApi.updateNote(id, { taskStatus: status });
    await fetchTasks();
  };

  const startEdit = (note: Note) => {
    setEditingNote(note.id);
    setEditContent(note.content);
  };

  // ── Render helpers ──

  const renderNoteItem = (note: Note, showStatus = false) => (
    <div key={note.id} className="bg-slate-800 rounded-lg p-3 border border-slate-700/50 group">
      {editingNote === note.id ? (
        <div className="flex gap-2">
          <input
            className="flex-1 bg-slate-700 text-white rounded px-3 py-1.5 text-sm border border-slate-600 focus:border-blue-500 outline-none"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEditSave(note.id)}
            autoFocus
          />
          <button
            onClick={() => handleEditSave(note.id)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
          >
            Salveaza
          </button>
          <button
            onClick={() => setEditingNote(null)}
            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm transition-colors"
          >
            Anuleaza
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {showStatus && note.taskStatus && (
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 ${
                note.taskStatus === 'done' ? 'bg-green-500/20 text-green-400' :
                note.taskStatus === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-slate-500/20 text-slate-400'
              }`}>
                {note.taskStatus === 'done' ? 'Gata' : note.taskStatus === 'in_progress' ? 'In lucru' : 'De facut'}
              </span>
            )}
            <span className={`text-sm ${note.taskStatus === 'done' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
              {note.content}
            </span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {showStatus && note.taskStatus !== 'done' && (
              <button
                onClick={() => handleTaskStatusChange(note.id, note.taskStatus === 'todo' ? 'in_progress' : 'done')}
                className="p-1 text-green-400/60 hover:text-green-400 transition-colors"
                title={note.taskStatus === 'todo' ? 'Incepe' : 'Finalizeaza'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            )}
            <button
              onClick={() => startEdit(note)}
              className="p-1 text-blue-400/60 hover:text-blue-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => handleDeleteNote(note.id)}
              className="p-1 text-red-400/60 hover:text-red-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <h1 className="text-2xl font-bold text-white mb-6">Carnet Personal</h1>

      {/* Main tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('time')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'time' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Time Management
        </button>
        <button
          onClick={() => setTab('ideas')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'ideas' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Idei
        </button>
      </div>

      {/* ── TIME MANAGEMENT ── */}
      {tab === 'time' && (
        <div>
          {/* Sub-tabs */}
          <div className="flex gap-1 mb-4 bg-slate-800 rounded-lg p-1 w-fit">
            <button
              onClick={() => setTimeSubTab('steps')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                timeSubTab === 'steps' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pasi
            </button>
            <button
              onClick={() => setTimeSubTab('tasks')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                timeSubTab === 'tasks' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Taskuri
            </button>
          </div>

          {/* Steps */}
          {timeSubTab === 'steps' && (
            <div>
              <div className="flex gap-2 mb-4">
                <input
                  className="flex-1 bg-slate-800 text-white rounded-lg px-4 py-2.5 text-sm border border-slate-700 focus:border-blue-500 outline-none placeholder-slate-500"
                  placeholder="Adauga un pas nou..."
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
                />
                <button
                  onClick={handleAddStep}
                  disabled={loading || !newStep.trim()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Adauga
                </button>
              </div>
              <div className="space-y-2">
                {steps.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">Niciun pas adaugat inca.</p>
                ) : (
                  steps.map((s) => renderNoteItem(s))
                )}
              </div>
            </div>
          )}

          {/* Tasks */}
          {timeSubTab === 'tasks' && (
            <div>
              <div className="flex gap-2 mb-3">
                <input
                  className="flex-1 bg-slate-800 text-white rounded-lg px-4 py-2.5 text-sm border border-slate-700 focus:border-blue-500 outline-none placeholder-slate-500"
                  placeholder="Adauga un task nou..."
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                />
                <button
                  onClick={handleAddTask}
                  disabled={loading || !newTask.trim()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Adauga
                </button>
              </div>
              {/* Filter */}
              <div className="flex gap-1 mb-4">
                {['', 'todo', 'in_progress', 'done'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setTaskFilter(f)}
                    className={`px-3 py-1 rounded text-xs transition-colors ${
                      taskFilter === f ? 'bg-blue-600/30 text-blue-400' : 'bg-slate-800 text-slate-500 hover:text-white'
                    }`}
                  >
                    {f === '' ? 'Toate' : f === 'todo' ? 'De facut' : f === 'in_progress' ? 'In lucru' : 'Gata'}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">Niciun task.</p>
                ) : (
                  tasks.map((t) => renderNoteItem(t, true))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── IDEAS ── */}
      {tab === 'ideas' && (
        <div>
          {!selectedTopic ? (
            /* Topic list */
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Topicuri</h2>
                <button
                  onClick={() => setShowAddTopic(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  + Topic nou
                </button>
              </div>
              <div className="grid gap-3">
                {topics.map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() => setSelectedTopic(topic)}
                    className="bg-slate-800 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600 transition-colors text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{topic.emoji || '📝'}</span>
                        <div>
                          <h3 className="text-white font-medium">{topic.name}</h3>
                          {topic.description && (
                            <p className="text-slate-500 text-xs mt-0.5">{topic.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 text-sm">{topic.ideaCount} idei</span>
                        {!topic.isPredefined && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTopic(topic.id); }}
                            className="p-1 text-red-400/0 group-hover:text-red-400/60 hover:!text-red-400 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Ideas in topic — notebook style */
            <div>
              <button
                onClick={() => { setSelectedTopic(null); setIdeas([]); }}
                className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-4 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Inapoi la topicuri
              </button>
              <div className="flex items-center gap-2 mb-5">
                <span className="text-2xl">{selectedTopic.emoji || '📝'}</span>
                <h2 className="text-lg font-semibold text-white">{selectedTopic.name}</h2>
              </div>

              {/* Notebook-style write area */}
              <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-4 mb-6">
                <textarea
                  className="w-full bg-transparent text-white text-sm leading-relaxed resize-none outline-none placeholder-slate-500 min-h-[120px]"
                  placeholder="Scrie aici... ganduri, idei, notite, orice vrei sa retii..."
                  value={newIdea}
                  onChange={(e) => setNewIdea(e.target.value)}
                  rows={5}
                />
                <div className="flex justify-end mt-2 pt-2 border-t border-slate-700/50">
                  <button
                    onClick={handleAddIdea}
                    disabled={loading || !newIdea.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Salveaza nota
                  </button>
                </div>
              </div>

              {/* Saved notes — notebook pages */}
              <div className="space-y-4">
                {ideas.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">Nicio nota in acest topic. Scrie ceva mai sus!</p>
                ) : (
                  ideas.map((idea) => (
                    <div key={idea.id} className="bg-slate-800/60 rounded-xl border border-slate-700/30 group">
                      {editingNote === idea.id ? (
                        <div className="p-4">
                          <textarea
                            className="w-full bg-slate-700/50 text-white text-sm leading-relaxed rounded-lg px-3 py-2 resize-none outline-none border border-slate-600 focus:border-blue-500 min-h-[120px]"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-2 mt-3 justify-end">
                            <button
                              onClick={() => setEditingNote(null)}
                              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm transition-colors"
                            >
                              Anuleaza
                            </button>
                            <button
                              onClick={() => handleEditSave(idea.id)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
                            >
                              Salveaza
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4">
                          <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{idea.content}</p>
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/30">
                            <span className="text-slate-600 text-xs">
                              {idea.createdAt ? new Date(idea.createdAt).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEdit(idea)}
                                className="p-1.5 text-blue-400/60 hover:text-blue-400 transition-colors"
                                title="Editeaza"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteNote(idea.id)}
                                className="p-1.5 text-red-400/60 hover:text-red-400 transition-colors"
                                title="Sterge"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Add Topic Modal ── */}
      {showAddTopic && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAddTopic(false)}>
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-lg mb-4">Topic nou</h3>
            <div className="space-y-3">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">Nume</label>
                <input
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:border-blue-500 outline-none"
                  value={topicForm.name}
                  onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })}
                  placeholder="Numele topicului"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">Emoji (optional)</label>
                <input
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:border-blue-500 outline-none"
                  value={topicForm.emoji}
                  onChange={(e) => setTopicForm({ ...topicForm, emoji: e.target.value })}
                  placeholder="ex: 💡"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">Descriere (optional)</label>
                <input
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:border-blue-500 outline-none"
                  value={topicForm.description}
                  onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
                  placeholder="Scurta descriere"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAddTopic(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
              >
                Anuleaza
              </button>
              <button
                onClick={handleCreateTopic}
                disabled={!topicForm.name.trim() || loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Creaza
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
