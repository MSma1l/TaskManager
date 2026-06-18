import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi, MeResponse } from '../../auth/api/auth';
import { useTheme } from '../../../shared/hooks/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import Tour from '../../../shared/components/tour/Tour';
import FriendsCard from '../../friends/components/FriendsCard';
import PushToggle from '../../notifications/components/PushToggle';
import PersonalStatsCard from '../../stats/components/PersonalStatsCard';
import TeamStatsCard from '../../stats/components/TeamStatsCard';

interface NotificationPrefs {
  telegram?: boolean;
  web?: boolean;
  doNotDisturbStart?: string;
  doNotDisturbEnd?: string;
  defaultReminderMinutes?: number[];
}

const DEFAULT_NOTIF: NotificationPrefs = {
  telegram: true,
  web: true,
  doNotDisturbStart: '',
  doNotDisturbEnd: '',
  defaultReminderMinutes: [15],
};

export default function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [notif, setNotif] = useState<NotificationPrefs>(DEFAULT_NOTIF);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkInfo, setLinkInfo] = useState<{ code: string; expiresAt: string; instructions: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordSavedAt, setAdminPasswordSavedAt] = useState<string | null>(null);

  const restartTour = () => {
    localStorage.removeItem('tour:done');
    setTourOpen(true);
  };

  useEffect(() => {
    authApi.me()
      .then((data) => {
        setMe(data);
        setFullName(data.fullName || '');
        setEmail(data.email || '');
        if (data.theme && (data.theme === 'dark' || data.theme === 'light')) {
          setTheme(data.theme);
        }
        const incoming = (data.notificationSettings as NotificationPrefs) || {};
        setNotif({ ...DEFAULT_NOTIF, ...incoming });
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Eroare incarcare profil'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfile = async () => {
    setError(null);
    try {
      const updated = await authApi.updateMe({
        fullName,
        email,
        theme,
        notificationSettings: notif as Record<string, unknown>,
      });
      setMe(updated);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare salvare');
    }
  };

  const savePin = async () => {
    setError(null);
    try {
      await authApi.setPin(pin);
      setPin('');
      setSavedAt(new Date().toLocaleTimeString());
      const data = await authApi.me();
      setMe(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'PIN invalid');
    }
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const handleGenerateLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await authApi.generateMyLinkCode();
      setLinkInfo(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare generare cod');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAdminPassword = async () => {
    setError(null);
    if (adminPassword.length < 6) {
      setError('Parola admin trebuie sa aiba minim 6 caractere');
      return;
    }
    setBusy(true);
    try {
      await authApi.setAdminPassword(adminPassword);
      setAdminPassword('');
      setAdminPasswordSavedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare la salvare parola');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!confirm('Sigur dezlegi Telegram-ul de la cont? Nu vei mai primi reminderuri pana cand nu il legi din nou.')) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.unlinkTelegram();
      const data = await authApi.me();
      setMe(data);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Eroare dezlegare');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profil</h1>
        <p className="text-muted text-sm">{me?.username} · {me?.role}</p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">{error}</div>}
      {savedAt && <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg px-3 py-2 text-sm">Salvat la {savedAt}</div>}

      {/* Profile frame */}
      <Card title="Profil">
        <Field label="Nume complet">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <div className="pt-2">
          <button onClick={saveProfile} className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm">
            Salveaza profil
          </button>
        </div>
      </Card>

      {/* Statistici personale (story points) */}
      <PersonalStatsCard />

      {/* Statistici de echipa (doar admini) */}
      {me?.role === 'ADMIN' && <TeamStatsCard />}

      {/* Colaboratori (prieteni / colegi) */}
      <FriendsCard />

      {/* Telegram link */}
      <Card title="Telegram">
        {me?.telegramLinked ? (
          <>
            <p className="text-sm text-emerald-500">✓ Cont legat la Telegram</p>
            <p className="text-xs text-muted">Primesti coduri de logare 2FA si reminderurile aici.</p>
            <div className="pt-1">
              <button
                onClick={handleUnlinkTelegram}
                disabled={busy}
                className="bg-red-600/15 hover:bg-red-600/25 text-red-500 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              >
                Dezleaga
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">Nelegat. Genereaza un cod si trimite-l botului ca <code className="bg-input px-1 rounded">/link &lt;cod&gt;</code>.</p>
            <div className="pt-1">
              <button
                onClick={handleGenerateLink}
                disabled={busy}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              >
                {busy ? 'Se genereaza...' : 'Genereaza cod /link'}
              </button>
            </div>
          </>
        )}
      </Card>

      {/* Theme */}
      <Card title="Aspect">
        <p className="text-sm text-muted mb-2">Alege stilul aplicatiei.</p>
        <div className="grid grid-cols-2 gap-3">
          <ThemeChoice
            active={theme === 'dark'}
            onClick={() => setTheme('dark')}
            label="Intunecat"
            sub="Implicit, contrast inalt"
            preview={['#0f172a', '#1e293b', '#3b82f6', '#f8fafc']}
          />
          <ThemeChoice
            active={theme === 'light'}
            onClick={() => setTheme('light')}
            label="Luminos"
            sub="Stil deschis, ca Outlook"
            preview={['#f8fafc', '#ffffff', '#3b82f6', '#0f172a']}
          />
        </div>
      </Card>

      {/* Notifications */}
      <Card title="Notificari">
        <Toggle label="Trimite reminderuri pe Telegram" value={!!notif.telegram} onChange={(v) => setNotif({ ...notif, telegram: v })} />
        <Toggle label="Notificari in browser" value={!!notif.web} onChange={(v) => setNotif({ ...notif, web: v })} />

        {/* Web Push — notificari chiar cu aplicatia inchisa */}
        <div className="border-t border-border pt-3">
          <PushToggle />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nu deranja - de la">
            <input type="time" value={notif.doNotDisturbStart || ''} onChange={(e) => setNotif({ ...notif, doNotDisturbStart: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Pana la">
            <input type="time" value={notif.doNotDisturbEnd || ''} onChange={(e) => setNotif({ ...notif, doNotDisturbEnd: e.target.value })} className={inputCls} />
          </Field>
        </div>

        <Field label="Reminder implicit pentru evenimente noi">
          <select
            value={(notif.defaultReminderMinutes && notif.defaultReminderMinutes[0]) ?? 15}
            onChange={(e) => setNotif({ ...notif, defaultReminderMinutes: [parseInt(e.target.value, 10)] })}
            className={inputCls}
          >
            <option value={0}>La inceput</option>
            <option value={5}>5 min inainte</option>
            <option value={15}>15 min inainte</option>
            <option value={30}>30 min inainte</option>
            <option value={60}>1 ora inainte</option>
            <option value={1440}>1 zi inainte</option>
          </select>
        </Field>

        <div className="pt-1">
          <button onClick={saveProfile} className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm">
            Salveaza notificari
          </button>
        </div>
      </Card>

      {linkInfo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setLinkInfo(null)}>
          <div className="bg-surface rounded-xl p-5 border border-border max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Cod /link</h3>
            <p className="text-xs text-muted mb-3 whitespace-pre-line">{linkInfo.instructions}</p>
            <div className="bg-input rounded-lg p-3 text-center text-3xl font-mono tracking-widest mb-3">
              {linkInfo.code}
            </div>
            <p className="text-xs text-muted">Expira: {new Date(linkInfo.expiresAt).toLocaleString()}</p>
            <button onClick={() => setLinkInfo(null)} className="mt-4 w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm">
              Inchide
            </button>
          </div>
        </div>
      )}

      {/* Ghid */}
      <Card title="Ghid prin aplicatie">
        <p className="text-sm text-muted">
          Tour interactiv care explica fiecare zona — taskuri, proiecte, calendar, schite, profil.
        </p>
        <div className="pt-1">
          <button
            onClick={restartTour}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm"
          >
            Reia ghidul
          </button>
        </div>
      </Card>

      {tourOpen && <Tour forceOpen onClose={() => setTourOpen(false)} />}

      {/* Gestionare (doar admini) — trecere directa la panoul de admin */}
      {me?.role === 'ADMIN' && (
        <Card title="Gestionare (Admin)">
          <p className="text-sm text-muted">
            Panoul de administrare: cereri de logare, utilizatori, statistici.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Link
              to="/admin_task_manager/requests"
              className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm text-center font-medium"
            >
              Cereri de logare
            </Link>
            <Link
              to="/admin_task_manager/users"
              className="bg-surface hover:bg-elevated border border-border text-fg rounded-lg px-4 py-2 text-sm text-center"
            >
              Utilizatori
            </Link>
            <Link
              to="/admin_task_manager/dashboard"
              className="bg-surface hover:bg-elevated border border-border text-fg rounded-lg px-4 py-2 text-sm text-center"
            >
              Panou
            </Link>
            <Link
              to="/admin_task_manager/stats"
              className="bg-surface hover:bg-elevated border border-border text-fg rounded-lg px-4 py-2 text-sm text-center"
            >
              Statistici
            </Link>
          </div>
        </Card>
      )}

      {/* Admin password (only visible to admins) */}
      {me?.role === 'ADMIN' && (
        <Card title="Parola admin">
          <p className="text-sm text-muted">
            Foloseste-o pe pagina <code className="bg-input px-1 rounded">/admin_task_manager</code> pentru logare directa, fara cod Telegram.
          </p>
          <Field label="Parola noua (minim 6 caractere)">
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="parola admin"
              className={inputCls}
            />
          </Field>
          <div className="flex gap-2">
            <button
              onClick={handleSaveAdminPassword}
              disabled={busy || !adminPassword}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm"
            >
              {busy ? 'Se salveaza...' : 'Salveaza parola admin'}
            </button>
            {adminPasswordSavedAt && (
              <span className="text-xs text-emerald-500 self-center">Salvat la {adminPasswordSavedAt}</span>
            )}
          </div>
        </Card>
      )}

      {/* Security */}
      <Card title="Securitate">
        <p className="text-sm text-muted">PIN folosit la reinnoirea tokenului dupa 12 ore.</p>
        <Field label="PIN nou (4–8 cifre)">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder={me?.hasPin ? '••••' : 'fara PIN setat'}
            className={inputCls}
          />
        </Field>
        <div className="flex gap-2">
          <button onClick={savePin} disabled={!pin} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm">
            Salveaza PIN
          </button>
          <button onClick={handleLogout} className="bg-red-600/15 hover:bg-red-600/25 text-red-500 rounded-lg px-4 py-2 text-sm">
            Iesire din cont
          </button>
        </div>
      </Card>
    </div>
  );
}

const inputCls =
  'w-full bg-input text-fg rounded-lg px-3 py-2 border border-border focus:border-blue-500 focus:outline-none';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-xl border border-border p-4 space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-elevated'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`}
        />
      </button>
    </label>
  );
}

function ThemeChoice({
  active, onClick, label, sub, preview,
}: { active: boolean; onClick: () => void; label: string; sub: string; preview: [string, string, string, string] }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border-2 p-3 transition-all ${
        active ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-fg/30'
      }`}
    >
      <div className="rounded-lg overflow-hidden border border-border h-16 mb-2 flex">
        <div style={{ backgroundColor: preview[0], width: '30%' }} />
        <div style={{ backgroundColor: preview[1], flex: 1 }} className="flex items-center justify-center">
          <div style={{ backgroundColor: preview[2], width: '70%', height: '8px', borderRadius: '4px' }} />
        </div>
      </div>
      <p className="font-medium text-sm" style={{ color: active ? undefined : preview[3] === '#0f172a' ? undefined : undefined }}>
        {label}
      </p>
      <p className="text-xs text-muted">{sub}</p>
    </button>
  );
}
