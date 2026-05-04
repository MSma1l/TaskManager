import { useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';

interface Stroke {
  color: string;
  width: number;
  points: { x: number; y: number; p: number }[];
}

interface Props {
  initialImageData?: string | null;
  onSave: (dataUrl: string, width: number, height: number) => void;
  onCancel: () => void;
}

const COLORS = ['#0f172a', '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#a855f7'];
const SIZES = [1.5, 3, 5, 10];
type Paper = 'plain' | 'grid5' | 'grid10' | 'lines10' | 'dots5';
const PAPERS: { value: Paper; label: string }[] = [
  { value: 'plain', label: 'Goala' },
  { value: 'grid5', label: 'Patratele 0.5cm' },
  { value: 'grid10', label: 'Patratele 1cm' },
  { value: 'lines10', label: 'Linii 1cm' },
  { value: 'dots5', label: 'Puncte 0.5cm' },
];

// Approx: most 96-DPI screens give ~37.8 px/cm. We use 38 for round numbers.
const PX_PER_CM = 38;

export default function SketchPad({ initialImageData, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [eraser, setEraser] = useState(false);
  const [penOnly, setPenOnly] = useState(false);
  const [smoothing, setSmoothing] = useState(true);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [paper, setPaper] = useState<Paper>('grid5');
  const [showColorPicker, setShowColorPicker] = useState(false);

  const strokesRef = useRef<Stroke[]>([]);
  const undoneRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<{ pointerId: number | null; current: Stroke | null }>({ pointerId: null, current: null });
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
      ctx.setTransform(1, 0, 0, 1, 0, 0);
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

  // ── Background drawing ─────────────────────────────────────────────────
  const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    if (paper === 'plain') return;

    // pick line color contrasting with bg
    const isLightBg = isColorLight(bgColor);
    const lightLine = 'rgba(15, 23, 42, 0.18)';
    const darkLine = 'rgba(248, 250, 252, 0.18)';
    const heavyLight = 'rgba(15, 23, 42, 0.32)';
    const heavyDark = 'rgba(248, 250, 252, 0.30)';
    const lineColor = isLightBg ? lightLine : darkLine;
    const heavy = isLightBg ? heavyLight : heavyDark;

    ctx.lineWidth = 1;

    if (paper === 'grid5' || paper === 'grid10') {
      const small = paper === 'grid5' ? PX_PER_CM * 0.5 : PX_PER_CM;
      const large = paper === 'grid5' ? PX_PER_CM : PX_PER_CM * 2;
      ctx.strokeStyle = lineColor;
      for (let x = small; x < w; x += small) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = small; y < h; y += small) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // heavy lines every 1cm or 2cm
      ctx.strokeStyle = heavy;
      for (let x = large; x < w; x += large) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = large; y < h; y += large) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    } else if (paper === 'lines10') {
      ctx.strokeStyle = lineColor;
      const step = PX_PER_CM;
      for (let y = step; y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    } else if (paper === 'dots5') {
      ctx.fillStyle = heavy;
      const step = PX_PER_CM * 0.5;
      for (let y = step; y < h; y += step) {
        for (let x = step; x < w; x += step) {
          ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    drawBackground(ctx, w, h);
    if (baseImageRef.current) {
      ctx.drawImage(baseImageRef.current, 0, 0, w, h);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokesRef.current) drawStroke(ctx, s);
  };

  useEffect(() => { redraw(); /* eslint-disable-next-line */ }, [bgColor, paper]);

  // ── Stroke rendering with optional smoothing ──────────────────────────
  const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke) => {
    if (s.points.length === 0) return;

    if (s.color === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = s.width * 2.2;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (const pt of s.points.slice(1)) ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color;

    if (!smoothing || s.points.length < 3) {
      // Per-segment width for pressure response
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      ctx.lineWidth = pressureWidth(s.width, s.points[0].p);
      for (let i = 1; i < s.points.length; i++) {
        const p = s.points[i];
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineWidth = pressureWidth(s.width, p.p);
      }
      return;
    }

    // Quadratic Bezier smoothing — control point at each sampled point,
    // segment endpoint at midpoint between consecutive points (a classic
    // "moving midpoint" approximation that produces fluid handwriting).
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    ctx.lineWidth = pressureWidth(s.width, s.points[0].p);
    for (let i = 1; i < s.points.length - 1; i++) {
      const cur = s.points[i];
      const nxt = s.points[i + 1];
      const midX = (cur.x + nxt.x) / 2;
      const midY = (cur.y + nxt.y) / 2;
      ctx.quadraticCurveTo(cur.x, cur.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      ctx.lineWidth = pressureWidth(s.width, cur.p);
    }
    const last = s.points[s.points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  };

  const pressureWidth = (base: number, p: number) =>
    Math.max(0.5, base * (0.45 + p * 0.95));

  // ── Pointer events ─────────────────────────────────────────────────────
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
        x: ev.clientX - rect.left,
        y: ev.clientY - rect.top,
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
    if (!confirm('Stergi tot continutul?')) return;
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

  // ── Export to PDF (A4 portrait, fits canvas to page) ─────────────────────
  const exportPDF = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    // jsPDF: A4 portrait by default (210 x 297 mm)
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = 210;
    const pageH = 297;
    const margin = 10;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const ratio = cw / ch;

    let imgW = usableW;
    let imgH = imgW / ratio;
    if (imgH > usableH) {
      imgH = usableH;
      imgW = imgH * ratio;
    }
    const x = (pageW - imgW) / 2;
    const y = (pageH - imgH) / 2;
    pdf.addImage(dataUrl, 'PNG', x, y, imgW, imgH);
    pdf.save(`schita-${new Date().toISOString().slice(0, 10)}.pdf`);
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
          <input
            type="color"
            value={color}
            onChange={(e) => { setColor(e.target.value); setEraser(false); }}
            className="w-7 h-7 rounded-full border border-border cursor-pointer"
            title="Alege orice culoare"
          />

          <span className="w-px h-6 bg-border" />
          <span className="text-xs text-muted hidden sm:inline">Grosime:</span>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`w-8 h-8 rounded-md border flex items-center justify-center ${size === s ? 'border-blue-500 bg-blue-500/10' : 'border-border'}`}
              title={`${s}px`}
            >
              <span className="rounded-full bg-fg" style={{ width: Math.min(s, 12), height: Math.min(s, 12) }} />
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
          <button onClick={undo} className="px-2.5 py-1 rounded-md border border-border text-sm" title="Undo">↶</button>
          <button onClick={redo} className="px-2.5 py-1 rounded-md border border-border text-sm" title="Redo">↷</button>
          <button onClick={clear} className="px-2.5 py-1 rounded-md border border-border text-sm">Sterge tot</button>

          <span className="w-px h-6 bg-border" />
          <select
            value={paper}
            onChange={(e) => setPaper(e.target.value as Paper)}
            className="bg-input border border-border rounded-md px-2 py-1 text-sm"
            title="Tip foaie"
          >
            {PAPERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          <button
            onClick={() => setShowColorPicker((v) => !v)}
            className="px-2.5 py-1 rounded-md border border-border text-sm flex items-center gap-1.5"
            title="Culoare fundal"
          >
            <span className="w-4 h-4 rounded border border-border" style={{ backgroundColor: bgColor }} />
            Fundal
          </button>
          {showColorPicker && (
            <div className="flex items-center gap-1 bg-elevated px-2 py-1 rounded-md border border-border">
              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-7 h-7 cursor-pointer" />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="bg-input border border-border rounded px-1.5 py-0.5 text-xs font-mono w-20"
              />
              {['#ffffff', '#0f172a', '#fffbeb', '#f0f9ff', '#fef2f2'].map((c) => (
                <button
                  key={c}
                  onClick={() => setBgColor(c)}
                  className="w-5 h-5 rounded border border-border"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}

          <span className="w-px h-6 bg-border" />
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input type="checkbox" checked={penOnly} onChange={(e) => setPenOnly(e.target.checked)} />
            Doar stylus
          </label>
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input type="checkbox" checked={smoothing} onChange={(e) => { setSmoothing(e.target.checked); redraw(); }} />
            Linii fluide
          </label>

          <div className="flex-1" />
          <button onClick={exportPDF} className="px-3 py-1 rounded-md border border-border text-sm" title="Salveaza ca PDF A4">
            📄 PDF
          </button>
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

function isColorLight(hex: string): boolean {
  // accept #rrggbb / #rgb
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // YIQ luminance
  return (r * 299 + g * 587 + b * 114) / 1000 >= 140;
}
