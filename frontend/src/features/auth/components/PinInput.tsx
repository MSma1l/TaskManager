import { useState, useRef, useEffect } from 'react';

interface PinInputProps {
  length?: number;
  onComplete: (pin: string) => void;
  error?: boolean;
}

export default function PinInput({ length = 4, onComplete, error }: PinInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (error) {
      setValues(Array(length).fill(''));
      setTimeout(() => inputsRef.current[0]?.focus(), 500);
    }
  }, [error, length]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newValues = [...values];
    newValues[index] = value.slice(-1);
    setValues(newValues);

    if (value && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    if (newValues.every((v) => v !== '') && newValues.join('').length === length) {
      onComplete(newValues.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !values[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div className={`flex gap-4 justify-center ${error ? 'animate-shake' : ''}`}>
      {values.map((val, i) => (
        <div key={i} className="relative">
          <input
            ref={(el) => { inputsRef.current[i] = el; }}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={val}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={`w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 bg-slate-800 outline-none transition-colors ${
              error ? 'border-red-500' : val ? 'border-blue-500' : 'border-slate-600'
            } focus:border-blue-400`}
          />
          <div
            className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full transition-colors ${
              val ? 'bg-blue-500' : 'bg-slate-600'
            }`}
            style={{ display: 'none' }}
          />
        </div>
      ))}
    </div>
  );
}
