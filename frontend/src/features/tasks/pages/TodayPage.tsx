import TodayBoard from '../components/TodayBoard';

/**
 * Pagina „Astăzi": doar board-ul cu task-urile repartizate userului, grupate
 * pe zone (proiectele marcate de admin + Birou). Fără titluri, fără header,
 * full-screen până la bara de navigație de jos.
 *
 * Înălțimea: `AppLayout` rezervă deja `paddingTop` (safe-area + clopoțel) și
 * `paddingBottom` (safe-area + 5rem pentru BottomNav). Fixăm aici exact aceeași
 * înălțime utilă, ca board-ul să umple ecranul fără să treacă sub bara de jos.
 */
export default function TodayPage() {
  return (
    <div
      className="px-2 overflow-hidden"
      style={{
        height:
          'calc(100dvh - 5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - var(--app-bell-clearance, 0px))',
      }}
    >
      <TodayBoard />
    </div>
  );
}
