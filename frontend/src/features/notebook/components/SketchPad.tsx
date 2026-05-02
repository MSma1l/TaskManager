import { useEffect, useRef, useState } from 'react';

interface Stroke {
  color: string;
  width: number;
  points: { x: number; y: number; p: number }[]; // p = pressure 0..1
}

interface Props {
  initialImageData?: string | null;
  onSave: (dataUrl: string, width: number, height: number) => void;
  onCancel: () => void;
}

const COLORS = ['#0f172a', '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#a855f7'];
const SIZES = [2, 4, 8, 14];

export default function SketchPad({ initialImageData, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [eraser, setEraser] = useState(false);
  const [penOnly, setPenOnly] = useState(false); // palm rejection: only stylus draws
  const [bgColor, setBgColor] = useState<'light' | 'dark'>('light');

  const strokesRef = useRef<Stroke[]>([]);
  const undoneRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<{ pointerId: number | null; current: Stroke | null }>({ pointerId: null, current: null });

  // Load image into a base layer (so editing existing sketches works)
  const baseImageRef = useRef<HTMLImageElement | null>(null);

  // Resize / hidpi
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const { clientWidth: w, clientHeight: h } = wrap;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      redraw();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load initial image once
  useEffect(() => {
    if (!initialImageData) return;
    const img = new Image();
    img.onload = () => {
      baseImageRef.current = img;
      redraw();
    };
    img.src = initialImageData;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImageData]);

  // Redraw whole canvas from strokes (so undo works correctly with hidpi)
  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.save();
    ctx.fillStyle = bgColor === 'dark' ? '#0f172a' : '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (baseImageRef.current) {
      ctx.drawImage(baseImageRef.current, 0, 0, w, h);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokesRef.current) drawStroke(ctx, s);
    ctx.restore();
  };

  // Re-render on bg change
  useEffect(() => { redraw(); /* eslint-disable-next-line */ }, [bgColor]);

  const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke) => {
    if (s.points.length === 0) return;
    if (s.color === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = s.width * 2;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = s.color;
    }
    ctx.beginPath();
    const [first, ...rest] = s.points;
    ctx.moveTo(first.x, first.y);
    let prevW = s.color === 'eraser' ? s.width * 2 : Math.max(0.5, s.width * (0.4 + first.p * 0.8));
    ctx.lineWidth = prevW;
    for (const pt of rest) {
      const w = s.color === 'eraser' ? s.width * 2 : Math.max(0.5, s.width * (0.4 + pt.p * 0.8));
      // Smooth width transitions by drawing per-segment
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineWidth = (prevW + w) / 2;
      prevW = w;
    }
    if (s.color === 'eraser') ctx.restore();
  };

  // ── Pointer events ──────────────────────────────────────────────────────
  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      p: e.pressure && e.pressure > 0 ? e.pressure : 0.5,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (penOnly && e.pointerType !== 'pen') return;
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const pt = getPos(e);
    drawingRef.current.pointerId = e.pointerId;
    const stroke: Stroke = {
      color: eraser ? 'eraser' : color,
      width: size,
      points: [pt],
    };
    drawingRef.current.current = stroke;
    strokesRef.current.push(stroke);
    undoneRef.current = [];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current.pointerId !== e.pointerId || !drawingRef.current.current) return;
    if (penOnly && e.pointerType !== 'pen') return;
    const stroke = drawingRef.current.current;
    const events = (e.nativeEvent as any).getCoalescedEvents?.() ?? [e.nativeEvent];
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    for (const ev of events) {
      stroke.points.push({
        x: (ev.clientX - rect.left),
        y: (ev.clientY - rect.top),
        p: ev.pressure && ev.pressure > 0 ? ev.pressure : 0.5,
      });
    }
    redraw();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current.pointerId !== e.pointerId) return;
    drawingRef.current.pointerId = null;
    drawingRef.current.current = null;
  };

  const undo = () => {
    const last = strokesRef.current.pop();
    if (last) undoneRef.current.push(last);
    redraw();
  };
  const redo = () => {
    const last = undoneRef.current.pop();
    if (last) strokesRef.current.push(last);
    redraw();
  };
  const clear = () => {
    strokesRef.current = [];
    undoneRef.current = [];
    baseImageRef.current = null;
    redraw();
  };

  const save = () => {
    const canvas = canvasRef.current!;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl, canvas.clientWidth, canvas.clientHeight);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2">
      <div className="bg-surface rounded-xl border border-border w-full h-full max-w-5xl max-h-[95vh] flex flex-col" style={{ touchAction: 'none' }}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-2 border-b border-border">
          <span className="text-xs text-muted hidden sm:inline">Culoare:</span>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); setEraser(false); }}
              className={`w-7 h-7 rounded-full border-2 ${color === c && !eraser ? 'border-blue-500 scale-110' : 'border-border'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="w-px h-6 bg-border" />
          <span className="text-xs text-muted hidden sm:inline">Grosime:</span>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`w-8 h-8 rounded-md border flex items-center justify-center ${size === s ? 'border-blue-500 bg-blue-500/10' : 'border-border'}`}
            >
              <span className="rounded-full bg-fg" style={{ width: s, height: s }} />
            </button>
          ))}
          <span className="w-px h-6 bg-border" />
          <button
            onClick={() => setEraser((v) => !v)}
            className={`px-2.5 py-1 rounded-md text-sm border ${eraser ? 'bg-blue-500/20 border-blue-500' : 'border-border'}`}
            title="Radiera"
          >
            🧽
          </button>
          <button onClick={undo} className="px-2.5 py-1 rounded-md border border-border text-sm">↶</button>
          <button onClick={redo} className="px-2.5 py-1 rounded-md border border-border text-sm">↷</button>
          <button onClick={clear} className="px-2.5 py-1 rounded-md border border-border text-sm">Sterge tot</button>
          <span className="w-px h-6 bg-border" />
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input type="checkbox" checked={penOnly} onChange={(e) => setPenOnly(e.target.checked)} />
            Doar stylus
          </label>
          <button
            onClick={() => setBgColor((b) => (b === 'light' ? 'dark' : 'light'))}
            className="px-2.5 py-1 rounded-md border border-border text-xs"
          >
            Fundal: {bgColor === 'light' ? 'alb' : 'negru'}
          </button>

          <div className="flex-1" />
          <button onClick={onCancel} className="px-3 py-1 text-sm text-muted hover:text-fg">Anuleaza</button>
          <button onClick={save} className="bg-blue-600 hover:bg-blue-500 text-white rounded-md px-3 py-1 text-sm">Salveaza</button>
        </div>

        <div ref={wrapRef} className="flex-1 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="block w-full h-full cursor-crosshair"
            style={{ touchAction: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
