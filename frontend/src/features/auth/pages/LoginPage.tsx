import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import PinInput from '../components/PinInput';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  const [errorKey, setErrorKey] = useState(0);

  if (isAuthenticated) {
    navigate('/', { replace: true });
    return null;
  }

  const handlePin = async (pin: string) => {
    const success = await login(pin);
    if (success) {
      navigate('/', { replace: true });
    } else {
      setError(true);
      setErrorKey((k) => k + 1);
      setTimeout(() => setError(false), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center text-3xl font-bold mx-auto mb-4">
          TM
        </div>
        <h1 className="text-2xl font-bold text-white">Weekly Task Manager</h1>
        <p className="text-slate-400 mt-2">Introdu PIN-ul de acces</p>
      </div>

      <PinInput key={errorKey} onComplete={handlePin} error={error} />

      {error && (
        <p className="text-red-400 text-sm mt-4">PIN incorect. Incearca din nou.</p>
      )}
    </div>
  );
}
