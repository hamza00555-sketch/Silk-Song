'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';

// ─── Grid config ─────────────────────────────────────────────────────────────
const COLS            = 80;
const ROWS            = 56;
const TOTAL           = COLS * ROWS;       // 4480
const MAP_W           = 7680;
const MAP_H           = 5376;
const CELL_W          = MAP_W / COLS;      // 96
const CELL_H          = MAP_H / ROWS;      // 96
const GRID_LINE_COLOR = 'rgba(201,150,61,0.28)';
const HOVER_COLOR     = 'rgba(201,150,61,0.22)';
const SELECTED_COLOR  = 'rgba(200,48,58,0.35)';
const MIN_SCALE       = 0.06;
const MAX_SCALE       = 5;
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  selected: number | null;
  onSelect: (n: number | null) => void;
}

// CSS-pixel helpers — always use offsetWidth/Height, never canvas.width/height
const cW = (c: HTMLCanvasElement) => c.offsetWidth;
const cH = (c: HTMLCanvasElement) => c.offsetHeight;

export default function MapView({ selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const scanRef      = useRef<HTMLDivElement>(null);
  const markerRef    = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement | null>(null);

  // pan/zoom state stored in refs for zero-re-render perf
  const scale      = useRef(0.14);
  const offset     = useRef({ x: 0, y: 0 });
  const dragging   = useRef(false);
  const didDrag    = useRef(false);
  const dragStart  = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const lastTouch  = useRef<{ x: number; y: number } | null>(null);
  const pinchDist  = useRef<number | null>(null);
  const hovered    = useRef<number | null>(null);
  const rafId      = useRef(0);
  const floatTween = useRef<gsap.core.Tween | null>(null);

  const [ready, setReady] = useState(false);

  // ── utilities ───────────────────────────────────────────────────────────────
  const cellFromNum = (n: number) => ({
    col: (n - 1) % COLS,
    row: Math.floor((n - 1) / COLS),
  });

  // convert client coords → cell number (uses CSS pixels)
  const numFromClient = useCallback((cx: number, cy: number): number | null => {
    if (!containerRef.current) return null;
    const r  = containerRef.current.getBoundingClientRect();
    const lx = (cx - r.left - offset.current.x) / scale.current;
    const ly = (cy - r.top  - offset.current.y) / scale.current;
    if (lx < 0 || ly < 0 || lx >= MAP_W || ly >= MAP_H) return null;
    return Math.floor(ly / CELL_H) * COLS + Math.floor(lx / CELL_W) + 1;
  }, []);

  // ── clamp — MUST use CSS pixels (offsetWidth/Height) ────────────────────────
  const clamp = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W  = cW(canvas);
    const H  = cH(canvas);
    const mw = MAP_W * scale.current;
    const mh = MAP_H * scale.current;
    const minX = mw > W ? W - mw : (W - mw) / 2;
    const minY = mh > H ? H - mh : (H - mh) / 2;
    const maxX = mw > W ? 0      : (W - mw) / 2;
    const maxY = mh > H ? 0      : (H - mh) / 2;
    offset.current.x = Math.min(maxX, Math.max(minX, offset.current.x));
    offset.current.y = Math.min(maxY, Math.max(minY, offset.current.y));
  }, []);

  // ── marker position (CSS pixels) ────────────────────────────────────────────
  const updateMarker = useCallback((sel: number | null) => {
    const el = markerRef.current;
    if (!el) return;
    if (!sel) { el.style.opacity = '0'; return; }
    const { col, row } = cellFromNum(sel);
    const cx = offset.current.x + (col + 0.5) * CELL_W * scale.current;
    const cy = offset.current.y + (row + 0.5) * CELL_H * scale.current;
    el.style.left    = `${cx}px`;
    el.style.top     = `${cy}px`;
    el.style.opacity = '1';
  }, []);

  // ── draw (canvas 2D — uses CSS pixel dimensions for drawing) ────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W  = cW(canvas);
    const H  = cH(canvas);
    const s  = scale.current;
    const ox = offset.current.x;
    const oy = offset.current.y;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(imgRef.current, ox, oy, MAP_W * s, MAP_H * s);

    // visible cell range (only draw what's on screen)
    const c0 = Math.max(0,    Math.floor(-ox / (CELL_W * s)));
    const c1 = Math.min(COLS, Math.ceil((W - ox) / (CELL_W * s)));
    const r0 = Math.max(0,    Math.floor(-oy / (CELL_H * s)));
    const r1 = Math.min(ROWS, Math.ceil((H - oy) / (CELL_H * s)));

    ctx.save();

    // Grid lines
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth   = Math.max(0.4, s * 0.5);
    ctx.globalAlpha = 0.55;
    for (let c = c0; c <= c1; c++) {
      const x = ox + c * CELL_W * s;
      ctx.beginPath(); ctx.moveTo(x, oy + r0 * CELL_H * s); ctx.lineTo(x, oy + r1 * CELL_H * s); ctx.stroke();
    }
    for (let r = r0; r <= r1; r++) {
      const y = oy + r * CELL_H * s;
      ctx.beginPath(); ctx.moveTo(ox + c0 * CELL_W * s, y); ctx.lineTo(ox + c1 * CELL_W * s, y); ctx.stroke();
    }

    // Cell highlights
    const fillCell = (n: number, color: string) => {
      const { col, row } = cellFromNum(n);
      ctx.fillStyle   = color;
      ctx.globalAlpha = 1;
      ctx.fillRect(ox + col * CELL_W * s, oy + row * CELL_H * s, CELL_W * s, CELL_H * s);
    };
    if (hovered.current && hovered.current !== selected) fillCell(hovered.current, HOVER_COLOR);
    if (selected) fillCell(selected, SELECTED_COLOR);

    // Cell labels (only on hover / selected)
    const fontSize = Math.max(7, Math.min(16, CELL_W * s * 0.26));
    ctx.font         = `500 ${fontSize}px Inter`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha  = 1;

    const labelCell = (n: number, color: string) => {
      const { col, row } = cellFromNum(n);
      ctx.fillStyle = color;
      ctx.fillText(String(n), ox + (col + 0.5) * CELL_W * s, oy + (row + 0.5) * CELL_H * s);
    };
    if (hovered.current && hovered.current !== selected) labelCell(hovered.current, 'rgba(237,224,196,0.9)');
    if (selected) labelCell(selected, '#EDE0C4');

    ctx.restore();
    updateMarker(selected);
  }, [selected, updateMarker]);

  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(draw);
  }, [draw]);

  // ── zoom (pivot in CSS pixels) ───────────────────────────────────────────────
  const applyZoom = useCallback((delta: number, px: number, py: number) => {
    const old  = scale.current;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, old * (1 + delta)));
    const r    = next / old;
    offset.current.x = px - r * (px - offset.current.x);
    offset.current.y = py - r * (py - offset.current.y);
    scale.current = next;
    clamp();
    scheduleDraw();
  }, [clamp, scheduleDraw]);

  // ── focus cell (GSAP animated, CSS pixels) ───────────────────────────────────
  const focusCell = useCallback((n: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W  = cW(canvas);   // CSS pixels ✓
    const H  = cH(canvas);
    const { col, row } = cellFromNum(n);
    const targetScale  = Math.max(0.45, scale.current);
    const obj = { s: scale.current, ox: offset.current.x, oy: offset.current.y };

    gsap.to(obj, {
      s:  targetScale,
      ox: W / 2 - (col + 0.5) * CELL_W * targetScale,
      oy: H / 2 - (row + 0.5) * CELL_H * targetScale,
      duration: 0.75,
      ease: 'power2.inOut',
      onUpdate: () => {
        scale.current    = obj.s;
        offset.current   = { x: obj.ox, y: obj.oy };
        clamp();
        scheduleDraw();
      },
    });
  }, [clamp, scheduleDraw]);

  // ── marker float animation ───────────────────────────────────────────────────
  const startMarkerFloat = useCallback(() => {
    const el = markerRef.current;
    if (!el) return;
    floatTween.current?.kill();
    gsap.fromTo(el,
      { y: -28, opacity: 0, scale: 0.5 },
      { y: -20, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.8)',
        onComplete: () => {
          floatTween.current = gsap.to(el, {
            y: '-=8', duration: 1.1, ease: 'sine.inOut',
            yoyo: true, repeat: -1,
          });
        },
      }
    );
  }, []);

  // ── init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.src = '/map.png';
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current!;
      const dpr    = window.devicePixelRatio || 1;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      canvas.getContext('2d')!.scale(dpr, dpr);

      const W = cW(canvas);
      const H = cH(canvas);
      scale.current    = Math.min(W / MAP_W, H / MAP_H) * 0.9;
      offset.current.x = (W - MAP_W * scale.current) / 2;
      offset.current.y = (H - MAP_H * scale.current) / 2;
      setReady(true);
      scheduleDraw();
    };
  }, [scheduleDraw]);

  // redraw + marker when selection changes
  useEffect(() => {
    scheduleDraw();
    if (selected) startMarkerFloat();
    else { floatTween.current?.kill(); gsap.to(markerRef.current, { opacity: 0, duration: 0.2 }); }
  }, [selected, scheduleDraw, startMarkerFloat]);

  // scan line
  useEffect(() => {
    if (!ready || !scanRef.current) return;
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 8 });
    tl.fromTo(scanRef.current, { top: '-4px', opacity: 0 }, { top: '100%', opacity: 1, duration: 14, ease: 'none' });
    tl.to(scanRef.current, { opacity: 0, duration: 0.3 }, '-=0.3');
    return () => { tl.kill(); };
  }, [ready]);

  // resize
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !ready) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      canvas.getContext('2d')!.scale(dpr, dpr);
      clamp();
      scheduleDraw();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ready, clamp, scheduleDraw]);

  // expose to panels
  useEffect(() => {
    (window as any).__mapFocusCell  = focusCell;
    (window as any).__mapResetView  = resetView;
  }, [focusCell]);

  // ── reset ────────────────────────────────────────────────────────────────────
  const resetView = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const W  = cW(canvas);
    const H  = cH(canvas);
    const ts = Math.min(W / MAP_W, H / MAP_H) * 0.9;
    const obj = { s: scale.current, ox: offset.current.x, oy: offset.current.y };
    gsap.to(obj, {
      s: ts, ox: (W - MAP_W * ts) / 2, oy: (H - MAP_H * ts) / 2,
      duration: 0.6, ease: 'power2.inOut',
      onUpdate: () => { scale.current = obj.s; offset.current = { x: obj.ox, y: obj.oy }; scheduleDraw(); },
    });
    onSelect(null);
  };

  // ── mouse ────────────────────────────────────────────────────────────────────
  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging.current) {
      didDrag.current    = true;
      offset.current.x   = e.clientX - dragStart.current.x + dragStart.current.ox;
      offset.current.y   = e.clientY - dragStart.current.y + dragStart.current.oy;
      clamp(); scheduleDraw(); return;
    }
    const n = numFromClient(e.clientX, e.clientY);
    if (n !== hovered.current) { hovered.current = n; scheduleDraw(); }
  };
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current  = true;
    didDrag.current   = false;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.current.x, oy: offset.current.y };
  };
  const onMouseUp = (e: React.MouseEvent) => {
    dragging.current = false;
    if (!didDrag.current) {
      const n = numFromClient(e.clientX, e.clientY);
      onSelect(n === selected ? null : n);
    }
  };
  const onMouseLeave = () => { hovered.current = null; scheduleDraw(); };
  const onWheel = (e: React.WheelEvent) => {
    const r = containerRef.current!.getBoundingClientRect();
    applyZoom(-e.deltaY * 0.001, e.clientX - r.left, e.clientY - r.top);
  };

  // ── touch ────────────────────────────────────────────────────────────────────
  const getDist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchDist.current = getDist(e.touches);
      dragging.current  = true;
    } else {
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      didDrag.current   = false;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchDist.current !== null) {
      const newD = getDist(e.touches);
      const mx   = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my   = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const r    = containerRef.current!.getBoundingClientRect();
      applyZoom((newD / pinchDist.current - 1) * 0.7, mx - r.left, my - r.top);
      pinchDist.current = newD;
      return;
    }
    if (e.touches.length === 1 && lastTouch.current) {
      const dx = e.touches[0].clientX - lastTouch.current.x;
      const dy = e.touches[0].clientY - lastTouch.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) didDrag.current = true;
      offset.current.x += dx;
      offset.current.y += dy;
      clamp(); scheduleDraw();
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    pinchDist.current = null;
    if (!didDrag.current && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const n = numFromClient(t.clientX, t.clientY);
      onSelect(n === selected ? null : n);
      if (n) focusCell(n);
    }
    dragging.current  = false;
    lastTouch.current = null;
  };

  const zoomIn  = () => { const c = canvasRef.current; if (c) applyZoom(0.3,  cW(c)/2, cH(c)/2); };
  const zoomOut = () => { const c = canvasRef.current; if (c) applyZoom(-0.3, cW(c)/2, cH(c)/2); };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={{ cursor: 'crosshair' }}>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none', display: 'block' }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onWheel={onWheel as any}
        onTouchStart={onTouchStart as any}
        onTouchMove={onTouchMove as any}
        onTouchEnd={onTouchEnd as any}
      />

      {/* ── Animated pin marker ───────────────────────────────────────── */}
      <div
        ref={markerRef}
        className="absolute pointer-events-none"
        style={{ opacity: 0, zIndex: 15, transform: 'translate(-50%, -100%)', top: 0, left: 0 }}
      >
        {/* Pulse ring */}
        <div style={{
          position: 'absolute', bottom: -2, left: '50%',
          transform: 'translateX(-50%)',
          width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(200,48,58,0.18)',
          animation: 'pinRing 1.4s ease-out infinite',
        }} />

        {/* Needle SVG */}
        <svg width="36" height="52" viewBox="0 0 36 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Outer circle */}
          <circle cx="18" cy="16" r="14" fill="#8B1A22" stroke="#C9963D" strokeWidth="1.5"/>
          {/* Inner circle */}
          <circle cx="18" cy="16" r="9" fill="#C8303A"/>
          {/* Sparkle center */}
          <circle cx="18" cy="16" r="4" fill="rgba(237,224,196,0.35)"/>
          {/* Needle tip */}
          <path d="M11 27 L18 50 L25 27" fill="#8B1A22" stroke="#C9963D" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>

        {/* Coordinate label */}
        {selected && (
          <div style={{
            position: 'absolute', top: 6, left: 0, right: 0,
            textAlign: 'center',
            color: '#EDE0C4',
            fontFamily: 'Cinzel, serif',
            fontSize: selected > 999 ? 8 : 10,
            fontWeight: 600,
            letterSpacing: '0.04em',
            lineHeight: 1,
          }}>
            {selected.toString().padStart(4, '0')}
          </div>
        )}
      </div>

      {/* Scan line */}
      <div ref={scanRef} className="absolute left-0 right-0 pointer-events-none" style={{
        height: 3,
        background: 'linear-gradient(90deg,transparent 0%,rgba(201,150,61,0.35) 30%,rgba(201,150,61,0.7) 50%,rgba(201,150,61,0.35) 70%,transparent 100%)',
        filter: 'blur(1px)', top: '-4px', opacity: 0, zIndex: 5,
      }} />

      {/* Loading */}
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50" style={{ background: '#09080F' }}>
          <p className="font-cinzel text-sm" style={{ color: 'var(--accent-gold)', letterSpacing: '0.15em' }}>
            جارٍ تحميل خريطة فارلوم…
          </p>
          <div className="mt-4 w-48 h-px" style={{
            background: 'linear-gradient(90deg,transparent,var(--accent-gold),transparent)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </div>
      )}

      {/* Zoom buttons */}
      {ready && (
        <div className="absolute flex flex-col gap-2 z-20" style={{ bottom: 100, left: 12 }}>
          {[{ l: '+', fn: zoomIn, t: 'تكبير' }, { l: '−', fn: zoomOut, t: 'تصغير' }, { l: '⌖', fn: resetView, t: 'إعادة ضبط' }]
            .map(({ l, fn, t }) => (
              <button key={l} onClick={fn} title={t}
                className="glass font-cinzel flex items-center justify-center rounded"
                style={{
                  width: 48, height: 48,
                  color: 'var(--accent-gold)',
                  fontSize: l === '⌖' ? 22 : 28,
                  fontWeight: 600,
                  border: '1px solid var(--border)',
                  touchAction: 'manipulation',
                }}
                onMouseEnter={e => gsap.to(e.currentTarget, { boxShadow: '0 0 12px 2px rgba(201,150,61,0.35)', duration: 0.2 })}
                onMouseLeave={e => gsap.to(e.currentTarget, { boxShadow: 'none', duration: 0.2 })}
              >{l}</button>
            ))}
        </div>
      )}

      <style>{`
        @keyframes pinRing {
          0%   { transform: translateX(-50%) scale(0.5); opacity: 0.9; }
          100% { transform: translateX(-50%) scale(2.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
