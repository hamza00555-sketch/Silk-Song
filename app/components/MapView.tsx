'use client';

import { useRef, useState, useEffect, useCallback, WheelEvent, MouseEvent, TouchEvent } from 'react';
import { gsap } from 'gsap';

// ─── Grid config (easy to change) ───────────────────────────────────────────
const COLS             = 80;
const ROWS             = 56;
const TOTAL            = COLS * ROWS;        // 4480
const MAP_W            = 7680;               // native image px
const MAP_H            = 5376;
const CELL_W           = MAP_W / COLS;       // 96
const CELL_H           = MAP_H / ROWS;       // 96
const GRID_OPACITY     = 0.55;
const HOVER_COLOR      = 'rgba(201,150,61,0.22)';
const SELECTED_COLOR   = 'rgba(200,48,58,0.38)';
const GRID_LINE_COLOR  = 'rgba(201,150,61,0.28)';
const MIN_SCALE        = 0.08;
const MAX_SCALE        = 4;
const INITIAL_SCALE    = 0.14;
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  selected: number | null;
  onSelect: (n: number | null) => void;
}

export default function MapView({ selected, onSelect }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const scanRef       = useRef<HTMLDivElement>(null);
  const imgRef        = useRef<HTMLImageElement | null>(null);
  const scaleRef      = useRef(INITIAL_SCALE);
  const offsetRef     = useRef({ x: 0, y: 0 });
  const dragging      = useRef(false);
  const dragStart     = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const hovered       = useRef<number | null>(null);
  const lastTouch     = useRef<{ x: number; y: number } | null>(null);
  const pinchDist     = useRef<number | null>(null);
  const rafId         = useRef<number>(0);
  const [ready, setReady] = useState(false);

  // ── helpers ───────────────────────────────────────────────────────────────
  const cellFromNum = (n: number) => ({ col: (n - 1) % COLS, row: Math.floor((n - 1) / COLS) });

  const numFromClient = useCallback((cx: number, cy: number): number | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const lx   = (cx - rect.left  - offsetRef.current.x) / scaleRef.current;
    const ly   = (cy - rect.top   - offsetRef.current.y) / scaleRef.current;
    if (lx < 0 || ly < 0 || lx >= MAP_W || ly >= MAP_H) return null;
    const col = Math.floor(lx / CELL_W);
    const row = Math.floor(ly / CELL_H);
    return row * COLS + col + 1;
  }, []);

  // ── draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !imgRef.current) return;

    // Use CSS (logical) dimensions because context is pre-scaled by DPR
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const s = scaleRef.current;
    const ox = offsetRef.current.x;
    const oy = offsetRef.current.y;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(imgRef.current, ox, oy, MAP_W * s, MAP_H * s);

    ctx.save();
    ctx.globalAlpha = GRID_OPACITY;

    // Grid lines
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth   = Math.max(0.4, s * 0.5);

    const c0 = Math.max(0, Math.floor(-ox / (CELL_W * s)));
    const c1 = Math.min(COLS, Math.ceil((W - ox) / (CELL_W * s)));
    const r0 = Math.max(0, Math.floor(-oy / (CELL_H * s)));
    const r1 = Math.min(ROWS, Math.ceil((H - oy) / (CELL_H * s)));

    for (let c = c0; c <= c1; c++) {
      const x = ox + c * CELL_W * s;
      ctx.beginPath(); ctx.moveTo(x, oy + r0 * CELL_H * s); ctx.lineTo(x, oy + r1 * CELL_H * s); ctx.stroke();
    }
    for (let r = r0; r <= r1; r++) {
      const y = oy + r * CELL_H * s;
      ctx.beginPath(); ctx.moveTo(ox + c0 * CELL_W * s, y); ctx.lineTo(ox + c1 * CELL_W * s, y); ctx.stroke();
    }

    // Cell fills (hover + selected)
    const drawCell = (n: number, color: string) => {
      const { col, row } = cellFromNum(n);
      ctx.fillStyle = color;
      ctx.fillRect(ox + col * CELL_W * s, oy + row * CELL_H * s, CELL_W * s, CELL_H * s);
    };

    if (hovered.current && hovered.current !== selected) drawCell(hovered.current, HOVER_COLOR);
    if (selected) drawCell(selected, SELECTED_COLOR);

    // Cell numbers (hover + selected)
    const fontSize = Math.max(8, Math.min(18, CELL_W * s * 0.28));
    ctx.font      = `500 ${fontSize}px Inter`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const drawLabel = (n: number, fillColor: string, textColor: string) => {
      const { col, row } = cellFromNum(n);
      const cx = ox + (col + 0.5) * CELL_W * s;
      const cy = oy + (row + 0.5) * CELL_H * s;
      ctx.globalAlpha = 1;
      ctx.fillStyle = textColor;
      ctx.fillText(String(n), cx, cy);
    };

    if (hovered.current && hovered.current !== selected) drawLabel(hovered.current, HOVER_COLOR, 'rgba(237,224,196,0.9)');
    if (selected) drawLabel(selected, SELECTED_COLOR, '#EDE0C4');

    ctx.restore();
  }, [selected]);

  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(draw);
  }, [draw]);

  // ── clamp offset ─────────────────────────────────────────────────────────
  const clampOffset = useCallback(() => {
    const W = canvasRef.current?.width  ?? window.innerWidth;
    const H = canvasRef.current?.height ?? window.innerHeight;
    const s = scaleRef.current;
    const mw = MAP_W * s;
    const mh = MAP_H * s;
    const minX = mw > W ? W - mw : (W - mw) / 2;
    const minY = mh > H ? H - mh : (H - mh) / 2;
    const maxX = mw > W ? 0      : (W - mw) / 2;
    const maxY = mh > H ? 0      : (H - mh) / 2;
    offsetRef.current.x = Math.min(maxX, Math.max(minX, offsetRef.current.x));
    offsetRef.current.y = Math.min(maxY, Math.max(minY, offsetRef.current.y));
  }, []);

  // ── zoom ─────────────────────────────────────────────────────────────────
  const applyZoom = useCallback((delta: number, pivotX: number, pivotY: number) => {
    const old = scaleRef.current;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, old * (1 + delta)));
    const ratio = next / old;
    offsetRef.current.x = pivotX - ratio * (pivotX - offsetRef.current.x);
    offsetRef.current.y = pivotY - ratio * (pivotY - offsetRef.current.y);
    scaleRef.current = next;
    clampOffset();
    scheduleDraw();
  }, [clampOffset, scheduleDraw]);

  // ── center on cell ───────────────────────────────────────────────────────
  const focusCell = useCallback((n: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { col, row } = cellFromNum(n);
    const targetScale = Math.max(0.4, scaleRef.current);
    const cx = (col + 0.5) * CELL_W * targetScale;
    const cy = (row + 0.5) * CELL_H * targetScale;
    const W  = canvas.width;
    const H  = canvas.height;
    const obj = { scale: scaleRef.current, ox: offsetRef.current.x, oy: offsetRef.current.y };
    gsap.to(obj, {
      duration: 0.7,
      ease: 'power2.inOut',
      scale: targetScale,
      ox: W / 2 - cx,
      oy: H / 2 - cy,
      onUpdate: () => {
        scaleRef.current = obj.scale;
        offsetRef.current = { x: obj.ox, y: obj.oy };
        clampOffset();
        scheduleDraw();
      },
    });
  }, [clampOffset, scheduleDraw]);

  // ── init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.src = '/map.png';
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current!;
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      scaleRef.current = Math.min(W / MAP_W, H / MAP_H) * 0.9;
      offsetRef.current.x = (W - MAP_W * scaleRef.current) / 2;
      offsetRef.current.y = (H - MAP_H * scaleRef.current) / 2;
      setReady(true);
      scheduleDraw();
    };
  }, [scheduleDraw]);

  // redraw when selection changes
  useEffect(() => { scheduleDraw(); }, [selected, scheduleDraw]);

  // scan line GSAP
  useEffect(() => {
    if (!ready || !scanRef.current) return;
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 6 });
    tl.fromTo(scanRef.current,
      { top: '-4px', opacity: 0 },
      { top: '100%', opacity: 1, duration: 12, ease: 'none' }
    );
    tl.to(scanRef.current, { opacity: 0, duration: 0.3 }, '-=0.3');
    return () => { tl.kill(); };
  }, [ready]);

  // resize
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !ready) return;
      const dpr = window.devicePixelRatio;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      clampOffset();
      scheduleDraw();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ready, clampOffset, scheduleDraw]);

  // ── mouse events ─────────────────────────────────────────────────────────
  const onMouseMove = (e: MouseEvent) => {
    if (dragging.current) {
      offsetRef.current.x = e.clientX - dragStart.current.x + dragStart.current.ox;
      offsetRef.current.y = e.clientY - dragStart.current.y + dragStart.current.oy;
      clampOffset();
      scheduleDraw();
      return;
    }
    const n = numFromClient(e.clientX, e.clientY);
    if (n !== hovered.current) { hovered.current = n; scheduleDraw(); }
  };

  const onMouseDown = (e: MouseEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
  };

  const onMouseUp = (e: MouseEvent) => {
    const moved = Math.abs(e.clientX - dragStart.current.x) + Math.abs(e.clientY - dragStart.current.y);
    dragging.current = false;
    if (moved < 5) {
      const n = numFromClient(e.clientX, e.clientY);
      onSelect(n === selected ? null : n);
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    applyZoom(-e.deltaY * 0.001, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onMouseLeave = () => { hovered.current = null; scheduleDraw(); };

  // ── touch events ─────────────────────────────────────────────────────────
  const getTouchDist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragging.current = false;
    } else if (e.touches.length === 2) {
      pinchDist.current = getTouchDist(e.touches);
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && pinchDist.current !== null) {
      const newDist = getTouchDist(e.touches);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = containerRef.current!.getBoundingClientRect();
      applyZoom((newDist / pinchDist.current - 1) * 0.6, cx - rect.left, cy - rect.top);
      pinchDist.current = newDist;
      return;
    }
    if (e.touches.length === 1 && lastTouch.current) {
      const dx = e.touches[0].clientX - lastTouch.current.x;
      const dy = e.touches[0].clientY - lastTouch.current.y;
      offsetRef.current.x += dx;
      offsetRef.current.y += dy;
      clampOffset();
      scheduleDraw();
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragging.current = true;
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    pinchDist.current = null;
    if (!dragging.current && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const n = numFromClient(t.clientX, t.clientY);
      onSelect(n === selected ? null : n);
    }
    dragging.current = false;
    lastTouch.current = null;
  };

  // expose focusCell + resetView via window for panels
  useEffect(() => {
    (window as any).__mapFocusCell = focusCell;
    (window as any).__mapResetView = reset;
    return () => {
      delete (window as any).__mapFocusCell;
      delete (window as any).__mapResetView;
    };
  }, [focusCell]);

  const zoomIn  = () => { const c = canvasRef.current; if (c) applyZoom(0.3, c.offsetWidth/2, c.offsetHeight/2); };
  const zoomOut = () => { const c = canvasRef.current; if (c) applyZoom(-0.3, c.offsetWidth/2, c.offsetHeight/2); };
  const reset   = () => {
    if (!canvasRef.current || !imgRef.current) return;
    const W = canvasRef.current.offsetWidth;
    const H = canvasRef.current.offsetHeight;
    const obj = { scale: scaleRef.current, ox: offsetRef.current.x, oy: offsetRef.current.y };
    const ts  = Math.min(W / MAP_W, H / MAP_H) * 0.9;
    gsap.to(obj, {
      scale: ts, ox: (W - MAP_W * ts) / 2, oy: (H - MAP_H * ts) / 2,
      duration: 0.6, ease: 'power2.inOut',
      onUpdate: () => {
        scaleRef.current = obj.scale;
        offsetRef.current = { x: obj.ox, y: obj.oy };
        scheduleDraw();
      },
    });
    onSelect(null);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={{ cursor: dragging.current ? 'grabbing' : 'crosshair' }}>
      {/* Map canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onWheel={onWheel as any}
        onTouchStart={onTouchStart as any}
        onTouchMove={onTouchMove as any}
        onTouchEnd={onTouchEnd as any}
      />

      {/* Ambient scan line */}
      <div
        ref={scanRef}
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          height: '3px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(201,150,61,0.35) 30%, rgba(201,150,61,0.7) 50%, rgba(201,150,61,0.35) 70%, transparent 100%)',
          filter: 'blur(1px)',
          top: '-4px',
          opacity: 0,
          zIndex: 5,
        }}
      />

      {/* Loading overlay */}
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50" style={{ background: '#09080F' }}>
          <p className="font-cinzel text-sm" style={{ color: 'var(--accent-gold)', letterSpacing: '0.2em' }}>
            LOADING MAP OF PHARLOOM…
          </p>
          <div className="mt-4 w-48 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--accent-gold), transparent)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
      )}

      {/* Zoom controls */}
      {ready && (
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20 md:bottom-6 md:right-6">
          {[
            { label: '+', fn: zoomIn,  title: 'Zoom In' },
            { label: '−', fn: zoomOut, title: 'Zoom Out' },
            { label: '⌖', fn: reset,   title: 'Reset View' },
          ].map(({ label, fn, title }) => (
            <button
              key={label}
              onClick={() => { gsap.fromTo(`#zbtn-${label}`, { scale: 0.88 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' }); fn(); }}
              id={`zbtn-${label}`}
              title={title}
              className="glass font-cinzel flex items-center justify-center rounded"
              style={{
                width: 40, height: 40,
                color: 'var(--accent-gold)',
                fontSize: label === '⌖' ? 20 : 22,
                fontWeight: 600,
                border: '1px solid var(--border)',
                transition: 'box-shadow 0.2s',
              }}
              onMouseEnter={e => gsap.to(e.currentTarget, { boxShadow: '0 0 12px 2px rgba(201,150,61,0.3)', duration: 0.2 })}
              onMouseLeave={e => gsap.to(e.currentTarget, { boxShadow: 'none', duration: 0.2 })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
