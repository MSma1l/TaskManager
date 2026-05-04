import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { accessRequestApi } from '../api/accessRequest';

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
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tgFromUrl) setTelegramChatId(tgFromUrl);
  }, [tgFromUrl]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setError('Numele si prenumele sunt obligatorii');
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
