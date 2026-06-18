import { useEffect, useState } from 'react';
import { useT } from '../../../shared/i18n/I18nProvider';
import { projectsApi, Project } from '../../projects/api/projects';
import {
  viewAccountApi,
  ReportShare,
  ShareScope,
} from '../api/viewaccount';

/**
 * Panou de management pentru linkurile publice de rapoarte ("View Account").
 * Listeaza linkurile userului, genereaza linkuri noi (echipa sau pe proiect),
 * afiseaza URL-ul complet cu buton de copiere si permite revocarea.
 *
 * De montat in pagina Reports (vezi nota din PR).
 */
export default function ShareReportPanel() {
  const t = useT();
  const [shares, setShares] = useState<ReportShare[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<ShareScope>('team');
  const [projectId, setProjectId] = useState<string>('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const reload = () => {
    viewAccountApi
      .listShares()
      .then(setShares)
      .catch(() => setShares([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    projectsApi
      .getAll()
      .then((list) => {
        setProjects(list);
        if (list.length > 0) setProjectId(list[0].id);
      })
      .catch(() => setProjects([]));
  }, []);

  const fullUrl = (token: string) => `${window.location.origin}/view/${token}`;

  const handleCreate = async () => {
    if (creating) return;
    setError(null);
    if (scope === 'project' && !projectId) {
      setError(t('viewAccount.errorPickProject'));
      return;
    }
    setCreating(true);
    try {
      await viewAccountApi.createShare({
        scope,
        projectId: scope === 'project' ? projectId : null,
        label: label.trim() || null,
      });
      setLabel('');
      reload();
    } catch {
      setError(t('viewAccount.errorCreate'));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (share: ReportShare) => {
    try {
      await navigator.clipboard.writeText(fullUrl(share.token));
      setCopiedId(share.id);
      setTimeout(() => setCopiedId((c) => (c === share.id ? null : c)), 1500);
    } catch {
      /* clipboard indisponibil — ignora */
    }
  };

  const handleRevoke = async (share: ReportShare) => {
    if (!window.confirm(t('viewAccount.confirmRevoke'))) return;
    try {
      await viewAccountApi.revokeShare(share.id);
      setShares((list) => list.filter((s) => s.id !== share.id));
    } catch {
      setError(t('viewAccount.errorRevoke'));
    }
  };

  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? id ?? '';

  return (
    <div className="rounded-2xl bg-surface border border-border p-5">
      <h2 className="text-lg font-bold text-fg mb-1">{t('viewAccount.panelTitle')}</h2>
      <p className="text-sm text-muted mb-4">{t('viewAccount.panelSubtitle')}</p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Generator */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">{t('viewAccount.scope')}</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as ShareScope)}
            className="px-3 py-2 rounded-xl bg-input border border-border text-fg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="team">{t('viewAccount.scopeTeam')}</option>
            <option value="project">{t('viewAccount.scopeProject')}</option>
          </select>
        </label>

        {scope === 'project' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{t('viewAccount.project')}</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-input border border-border text-fg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <span className="text-xs font-medium text-muted">{t('viewAccount.labelOptional')}</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('viewAccount.labelPlaceholder')}
            maxLength={150}
            className="px-3 py-2 rounded-xl bg-input border border-border text-fg text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
        >
          {creating ? t('viewAccount.generating') : t('viewAccount.generate')}
        </button>
      </div>

      {/* Lista linkurilor */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : shares.length === 0 ? (
        <p className="text-sm text-muted py-4">{t('viewAccount.noShares')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {shares.map((s) => (
            <div
              key={s.id}
              className="rounded-xl bg-elevated border border-border p-3 flex items-center gap-3 flex-wrap"
            >
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                    {s.scope === 'team'
                      ? t('viewAccount.scopeTeam')
                      : `${t('viewAccount.scopeProject')}: ${projectName(s.projectId)}`}
                  </span>
                  {s.label && <span className="text-xs text-muted">· {s.label}</span>}
                </div>
                <code className="text-xs text-muted truncate mt-0.5">{fullUrl(s.token)}</code>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(s)}
                className="inline-flex items-center justify-center rounded-lg bg-input border border-border text-fg px-3 py-1.5 text-xs font-medium hover:bg-surface transition"
              >
                {copiedId === s.id ? t('viewAccount.copied') : t('viewAccount.copy')}
              </button>
              <button
                type="button"
                onClick={() => handleRevoke(s)}
                className="inline-flex items-center justify-center rounded-lg border border-red-500/40 text-red-500 px-3 py-1.5 text-xs font-medium hover:bg-red-500/10 transition"
              >
                {t('viewAccount.revoke')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
