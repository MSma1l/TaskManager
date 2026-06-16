import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { accessRequestApi } from '../api/accessRequest';
import { authApi } from '../api/auth';

export default function RequestAccessPage() {
  const [params] = useSearchParams();
  const tgFromUrl = params.get('tg') || '';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [telegramChatId, setTelegramChatId] = useState(tgFromUrl);
  const [purpose, setPurpose] = useState<'personal' | 'collective'>('personal');
  const [reason, setReason] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tgRegisterLink, setTgRegisterLink] = useState<string | null>(null);

  useEffect(() => {
    if (tgFromUrl) setTelegramChatId(tgFromUrl);
  }, [tgFromUrl]);

  useEffect(() => {
    authApi.publicConfig()
      .then((cfg) => setTgRegisterLink(cfg.telegramRegisterDeepLink))
      .catch(() => { /* hide button if config unreachable */ });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setError('Numele si prenumele sunt obligatorii');
      return;
    }
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,30}$/.test(u)) {
      setError('Username: 3-30 caractere (a-z, 0-9, _, .)');
      return;
    }
    if (password.length < 6) {
      setError('Parola trebuie sa aiba minim 6 caractere');
      return;
    }
    if (pin && !/^\d{4,8}$/.test(pin)) {
      setError('PIN-ul trebuie sa aiba 4-8 cifre');
      return;
    }
    setBusy(true);
    try {
      const res = await accessRequestApi.submit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        telegramChatId: telegramChatId.trim() || undefined,
        purpose,
        reason: reason.trim() || undefined,
        username: u,
        password,
        pin: pin || undefined,
      });
      setSuccess(res.message || 'Cerere trimisa. Te vom contacta cand contul e activ.');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Eroare la trimitere');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-2xl font-bold mx-auto mb-3 text-white">
            TM
          </div>
          <h1 className="text-2xl font-bold text-white">Cerere de acces</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Completeaza formularul. Admin-ul revizuieste si iti raspunde pe Telegram.
          </p>
        </div>

        {/* Instant signup via Telegram bot — fastest path, no admin approval needed */}
        {!success && tgRegisterLink && (
          <a
            href={tgRegisterLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-gradient-to-br from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white rounded-xl p-4 mb-4 transition-all shadow-lg shadow-blue-900/30"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Inregistrare prin Telegram</p>
                <p className="text-xs text-blue-100/80">Botul iti cere numele, adminul aproba, apoi esti logat.</p>
              </div>
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </a>
        )}

        {!success && (
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-[11px] uppercase tracking-wider text-slate-500">sau cere acces clasic</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>
        )}

        {success ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl p-4 text-center">
            <p className="font-medium mb-2">Multumim!</p>
            <p className="text-sm">{success}</p>
            <Link to="/login" className="inline-block mt-4 text-blue-400 hover:underline text-sm">
              Inapoi la logare
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Prenume *">
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} required />
              </Field>
              <Field label="Nume *">
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} required />
              </Field>
            </div>

            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="email@exemplu.com" />
            </Field>

            <Field label="Numar de telefon">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+373 ..." />
            </Field>

            {/* Date de logare alese de user — dupa aprobare intri cu username + parola (sau PIN) */}
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 space-y-3">
              <p className="text-xs text-slate-400">
                Alege-ti datele de logare. Dupa ce adminul aproba, intri direct cu <b>username + parola</b> (sau PIN).
              </p>
              <Field label="Username *">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  className={inputCls}
                  placeholder="ex: ion.popescu"
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Parola * (min 6 caractere)">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                  placeholder="parola ta"
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field label="PIN (optional, 4-8 cifre) — pentru re-logare rapida">
                <input
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className={inputCls}
                  placeholder="ex: 1234"
                />
              </Field>
            </div>

            <Field label="Scop folosire">
              <div className="grid grid-cols-2 gap-2">
                {(['personal', 'collective'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPurpose(p)}
                    className={`py-2 rounded-lg border text-sm transition-all ${
                      purpose === p
                        ? 'border-blue-500 bg-blue-500/15 text-white'
                        : 'border-slate-600 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {p === 'personal' ? 'Personal' : 'Colectiv'}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Descriere (optional)">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className={`${inputCls} resize-none`}
                placeholder="Pe scurt, pentru ce ai nevoie de cont..."
              />
            </Field>

            <Field label="Telegram Chat ID (auto-completat de bot)">
              <input
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className={`${inputCls} ${tgFromUrl ? 'bg-slate-900/50' : ''}`}
                readOnly={!!tgFromUrl}
                placeholder="(optional — vezi /start in bot)"
              />
            </Field>

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-xl py-3 transition-colors"
            >
              {busy ? 'Se trimite...' : 'Trimite cerere'}
            </button>

            <div className="text-center pt-2">
              <Link to="/login" className="text-sm text-slate-400 hover:text-slate-200">
                Am deja cont — la logare
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const inputCls =
  'w-full bg-slate-700 text-white border border-slate-600 focus:border-blue-500 focus:outline-none rounded-lg px-3 py-2 text-sm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
