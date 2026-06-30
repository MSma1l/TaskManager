import { useState } from 'react';
import { avatarTint } from '../../features/projects/components/boardConstants';

interface UserAvatarProps {
  /** Data-URL / http URL al pozei de profil. Lipsă → cerc cu inițială. */
  avatarUrl?: string | null;
  /** Numele afișat (din care se ia inițiala). */
  name?: string | null;
  /** Seed determinist pentru culoarea de fundal (de obicei userId). */
  seed?: string;
  /** Diametru în px (default 32). */
  size?: number;
  /** Clase extra (ex: ring/border pentru stive de avatare). */
  className?: string;
  title?: string;
}

/**
 * Avatar reutilizabil: dacă există `avatarUrl` randează poza (rotundă, cover),
 * altfel un cerc colorat cu inițiala numelui. Pe eroare la încărcarea pozei
 * cade automat înapoi pe inițială. Vizual identic cu vechile cercuri de inițiale.
 */
export default function UserAvatar({
  avatarUrl,
  name,
  seed,
  size = 32,
  className = '',
  title,
}: UserAvatarProps) {
  const [broken, setBroken] = useState(false);
  const initial = (name || '?').charAt(0).toUpperCase();
  const tint = avatarTint(seed || name || '?');
  const dim = { width: size, height: size };

  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt={name || ''}
        title={title ?? name ?? undefined}
        width={size}
        height={size}
        style={dim}
        onError={() => setBroken(true)}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      title={title ?? name ?? undefined}
      style={{ ...dim, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      className={`rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${tint} ${className}`}
    >
      {initial}
    </span>
  );
}
