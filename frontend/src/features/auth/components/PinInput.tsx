import { useState, useRef, useEffect } from 'react';

interface PinInputProps {
  length?: number;
  onComplete: (pin: string) => void;
  error?: boolean;
  masked?: boolean; // dots vs digits
}

export default function PinInput({ length = 4, onComplete, error, masked = true }: PinInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setValues(Array(length).fill(''));
    inputsRef.current[0]?.focus();
  }, [length]);

  useEffect(() => {
    if (error) {
      setValues(Array(length).fill(''));
      setTimeout(() => inputsRef.current[0]?.focus(), 500);
    }
  }, [error, length]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    // Paste of multiple digits at once
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, length).split('');
      const next = Array(length).fill('');
      digits.forEach((d, i) => { next[i] = d; });
      setValues(next);
      const lastFilled = Math.min(digits.length, length) - 1;
      if (lastFilled >= 0 && lastFilled < length - 1) {
        inputsRef.current[lastFilled + 1]?.focus();
      } else {
        inputsRef.current[length - 1]?.blur();
      }
      if (digits.length === length) onComplete(next.join(''));
      return;
    }

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

  const cellSize = length > 4 ? 'w-11 h-14' : 'w-14 h-14';

  return (
    <div className={`flex gap-2 sm:gap-3 justify-center ${error ? 'animate-shake' : ''}`}>
      {values.map((val, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          type={masked ? 'password' : 'text'}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length}
          value={val}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className={`${cellSize} text-center text-2xl font-bold rounded-xl border-2 bg-slate-800 outline-none transition-colors ${
            error ? 'border-red-500' : val ? 'border-blue-500' : 'border-slate-600'
          } focus:border-blue-400`}
        />
      ))}
    </div>
  );
}
