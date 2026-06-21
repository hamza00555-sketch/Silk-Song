'use client';

import { useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react';
import { gsap } from 'gsap';

// ── Grid constants ────────────────────────────────────────────────────────────
const COLS   = 320;              // was 80 — cells are now 1/4 the size
const ROWS   = 224;              // was 56
const MAP_W  = 7680;
const MAP_H  = 5376;
const CELL_W = MAP_W / COLS;    // 24 px in image space
const CELL_H = MAP_H / ROWS;    // 24 px in image space

const MIN_SCALE = 0.06;
const MAX_SCALE = 8;
const MAX_DPR   = 2;            // cap canvas resolution on high-DPR phones

const GRID_COLOR  = 'rgba(201,150,61,0.30)';
const HOVER_COLOR = 'rgba(201,150,61,0.22)';
const SEL_COLOR   = 'rgba(200,48,58,0.38)';

// Pad cell numbers to 5 digits (max 71,680)
const PAD = String(COLS * ROWS).length;
// ─────────────────────────────────────────────────────────────────────────────

export interface MapViewHandle {
  focusCell: (n: number) => void;
  resetView: () => void;
}

interface Props {
  selected:  number | null;
  onSelect:  (n: number | null) => void;
  ref?:      React.Ref<MapViewHandle>;
}

// Always use CSS pixels — never canvas.width / canvas.height in math
const cW = (c: HTMLCanvasElement) => c.offsetWidth;
const cH = (c: HTMLCanvasElement) => c.offsetHeight;

const cellFromNum = (n: number) => ({
  col: (n - 1) % COLS,
  row: Math.floor((n - 1) / COLS),
});

export default function MapView({ selected, onSelect, ref }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const scanRef       = useRef<HTMLDivElement>(null);
  const markerPosRef  = useRef<HTMLDivElement>(null); // positioned by updateMarker
  const markerRef     = useRef<HTMLDivElement>(null); // animated by GSAP
  const imgRef        = useRef<HTMLImageElement | null>(null);
  const scanTlRef     = useRef<gsap.core.Timeline | null>(null);

  // All pan/zoom state lives in refs → zero React re-renders per frame
  const scale        = useRef(0.14);
  const offset       = useRef({ x: 0, y: 0 });
  const dragging     = useRef(false);
  const didDrag      = useRef(false);
  const dragStart    = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const lastTouch    = useRef<{ x: number; y: number } | null>(null);
  const pinchDist    = useRef<number | null>(null);
  const pinchActive  = useRef(false);
  const lastPinchEnd = useRef(0);
  const hovered      = useRef<number | null>(null);
  const drawPending  = useRef(false);
  const rafId        = useRef(0);
  const floatTween   = useRef<gsap.core.Tween | null>(null);
  const focusTween   = useRef<gsap.core.Tween | null>(null);
  const touching     = useRef(false);      // true while any finger is on screen

  const [ready, setReady] = useState(false);

  // ── Clamp offset so map stays visible ────────────────────────────────────────
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

  // ── Marker position — outer wrapper moves, inner is GSAP-animated ────────────
  // markerPosRef is at top:0 left:0 and shifted by transform3d (GPU layer)
  // markerRef (inner) has margin centering; GSAP handles y/opacity/scale
  const updateMarker = useCallback((sel: number | null) => {
    const pos = markerPosRef.current;
    if (!pos || !sel) return;
    const { col, row } = cellFromNum(sel);
    const cx = offset.current.x + (col + 0.5) * CELL_W * scale.current;
    const cy = offset.current.y + (row + 0.5) * CELL_H * scale.current;
    pos.style.transform = `translate3d(${cx}px,${cy}px,0)`;
  }, []);

  // ── Draw loop ─────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    drawPending.current = false;
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

    // Cull to visible cells only
    const c0 = Math.max(0,    Math.floor(-ox / (CELL_W * s)));
    const c1 = Math.min(COLS, Math.ceil((W - ox) / (CELL_W * s)));
    const r0 = Math.max(0,    Math.floor(-oy / (CELL_H * s)));
    const r1 = Math.min(ROWS, Math.ceil((H - oy) / (CELL_H * s)));

    ctx.save();

    // Grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth   = Math.max(0.35, s * 0.45);
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
    if (selected) fillCell(selected, SEL_COLOR);

    // Cell number labels — only when cell is wide enough to read
    const cellPx = CELL_W * s;
    if (cellPx >= 16) {
      const fontSize = Math.max(6, Math.min(13, cellPx * 0.38));
      ctx.font         = `600 ${fontSize}px Inter, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha  = 1;

      const labelCell = (n: number, textColor: string, shadowColor: string) => {
        const { col, row } = cellFromNum(n);
        const tx = ox + (col + 0.5) * CELL_W * s;
        const ty = oy + (row + 0.5) * CELL_H * s;
        // Subtle shadow for legibility on any map background
        ctx.fillStyle    = shadowColor;
        ctx.shadowColor  = 'transparent';
        ctx.fillText(String(n), tx + 0.5, ty + 0.5);
        ctx.fillStyle = textColor;
        ctx.fillText(String(n), tx, ty);
      };
      if (hovered.current && hovered.current !== selected)
        labelCell(hovered.current, '#FFFFFF', 'rgba(0,0,0,0.55)');
      if (selected)
        labelCell(selected, '#FFFFFF', 'rgba(0,0,0,0.6)');
    }

    ctx.restore();
    updateMarker(selected);
  }, [selected, updateMarker]);

  // One draw per frame maximum
  const scheduleDraw = useCallback(() => {
    if (drawPending.current) return;
    drawPending.current = true;
    rafId.current = requestAnimationFrame(draw);
  }, [draw]);

  // ── Zoom (pivot in CSS pixels) ────────────────────────────────────────────────
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

  // ── Animated pan+zoom to a cell ───────────────────────────────────────────────
  const focusCell = useCallback((n: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    focusTween.current?.kill();
    const W  = cW(canvas);
    const H  = cH(canvas);
    const { col, row } = cellFromNum(n);
    const targetScale  = Math.max(0.45, scale.current);
    const obj = { s: scale.current, ox: offset.current.x, oy: offset.current.y };
    focusTween.current = gsap.to(obj, {
      s:  targetScale,
      ox: W / 2 - (col + 0.5) * CELL_W * targetScale,
      oy: H / 2 - (row + 0.5) * CELL_H * targetScale,
      duration: 0.75,
      ease: 'power2.inOut',
      onUpdate: () => {
        scale.current  = obj.s;
        offset.current = { x: obj.ox, y: obj.oy };
        clamp();
        scheduleDraw();
      },
    });
  }, [clamp, scheduleDraw]);

  // ── Animated reset to initial fit ────────────────────────────────────────────
  const resetView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    focusTween.current?.kill();
    const W  = cW(canvas);
    const H  = cH(canvas);
    const ts = Math.min(W / MAP_W, H / MAP_H) * 0.9;
    const obj = { s: scale.current, ox: offset.current.x, oy: offset.current.y };
    gsap.to(obj, {
      s: ts, ox: (W - MAP_W * ts) / 2, oy: (H - MAP_H * ts) / 2,
      duration: 0.6, ease: 'power2.inOut',
      onUpdate: () => {
        scale.current  = obj.s;
        offset.current = { x: obj.ox, y: obj.oy };
        scheduleDraw();
      },
    });
    onSelect(null);
  }, [onSelect, scheduleDraw]);

  // Expose imperative API (React 19 — ref is a regular prop)
  useImperativeHandle(ref, () => ({ focusCell, resetView }), [focusCell, resetView]);

  // ── Marker float animation ────────────────────────────────────────────────────
  const startMarkerFloat = useCallback(() => {
    const el = markerRef.current;
    if (!el) return;
    floatTween.current?.kill();
    gsap.fromTo(el,
      { y: -20, opacity: 0, scale: 0.55 },
      {
        y: 0, opacity: 1, scale: 1,
        duration: 0.48, ease: 'back.out(1.9)',
        onComplete: () => {
          floatTween.current = gsap.to(el, {
            y: '-=7', duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1,
          });
        },
      }
    );
  }, []);

  // ── Init — load image, set canvas DPR, compute initial fit ───────────────────
  useEffect(() => {
    const img = new Image();
    img.src = '/map.png';
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current!;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
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

  // Redraw + marker on selection change
  useEffect(() => {
    scheduleDraw();
    if (selected) {
      startMarkerFloat();
    } else {
      floatTween.current?.kill();
      if (markerRef.current) gsap.to(markerRef.current, { opacity: 0, scale: 0.8, duration: 0.2 });
    }
  }, [selected, scheduleDraw, startMarkerFloat]);

  // Scan line (atmospheric effect)
  useEffect(() => {
    if (!ready || !scanRef.current) return;
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 9 });
    scanTlRef.current = tl;
    tl.fromTo(scanRef.current,
      { top: '-4px', opacity: 0 },
      { top: '100%', opacity: 1, duration: 14, ease: 'none' }
    );
    tl.to(scanRef.current, { opacity: 0, duration: 0.25 }, '-=0.25');
    return () => { tl.kill(); };
  }, [ready]);

  // Resize — debounced, skipped entirely during touch
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let timer: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      if (touching.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!canvas || !ready || touching.current) return;
        const dpr  = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const newW = canvas.offsetWidth  * dpr;
        const newH = canvas.offsetHeight * dpr;
        // Skip if dimensions didn't meaningfully change (avoids clearing canvas unnecessarily)
        if (Math.abs(newW - canvas.width) < 2 && Math.abs(newH - canvas.height) < 2) return;
        canvas.width  = newW;
        canvas.height = newH;
        canvas.getContext('2d')!.scale(dpr, dpr);
        clamp();
        scheduleDraw();
      }, 200);
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(canvas);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [ready, clamp, scheduleDraw]);

  // Pause/resume ambient animations when tab is hidden
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        scanTlRef.current?.pause();
        floatTween.current?.pause();
      } else {
        scanTlRef.current?.resume();
        if (selected) floatTween.current?.resume();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [selected]);

  // ── Hit test ─────────────────────────────────────────────────────────────────
  const numFromClient = useCallback((cx: number, cy: number): number | null => {
    if (!containerRef.current) return null;
    const r  = containerRef.current.getBoundingClientRect();
    const lx = (cx - r.left - offset.current.x) / scale.current;
    const ly = (cy - r.top  - offset.current.y) / scale.current;
    if (lx < 0 || ly < 0 || lx >= MAP_W || ly >= MAP_H) return null;
    return Math.floor(ly / CELL_H) * COLS + Math.floor(lx / CELL_W) + 1;
  }, []);

  // ── Mouse handlers ────────────────────────────────────────────────────────────
  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging.current) {
      didDrag.current  = true;
      offset.current.x = e.clientX - dragStart.current.x + dragStart.current.ox;
      offset.current.y = e.clientY - dragStart.current.y + dragStart.current.oy;
      clamp(); scheduleDraw(); return;
    }
    const n = numFromClient(e.clientX, e.clientY);
    if (n !== hovered.current) { hovered.current = n; scheduleDraw(); }
  };
  const onMouseDown = (e: React.MouseEvent) => {
    focusTween.current?.kill();
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

  // ── Touch handlers ────────────────────────────────────────────────────────────
  const getDist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e: React.TouchEvent) => {
    touching.current = true;
    focusTween.current?.kill();
    floatTween.current?.pause();
    scanTlRef.current?.pause();

    if (e.touches.length === 2) {
      pinchDist.current  = getDist(e.touches);
      pinchActive.current = true;
      didDrag.current    = true;   // prevent tap trigger on pinch end
      dragging.current   = true;
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
      applyZoom((newD / pinchDist.current - 1) * 0.65, mx - r.left, my - r.top);
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
    if (pinchActive.current) {
      lastPinchEnd.current = Date.now();
      pinchActive.current  = false;
    }
    pinchDist.current = null;

    // Guard: don't select after pinch
    const wasPinch = Date.now() - lastPinchEnd.current < 350;

    if (!didDrag.current && !wasPinch && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const n = numFromClient(t.clientX, t.clientY);
      onSelect(n === selected ? null : n);
      if (n) focusCell(n);
    }

    dragging.current  = false;
    lastTouch.current = null;

    // Resume ambient animations after interaction settles
    setTimeout(() => {
      touching.current = false;
      if (selected) floatTween.current?.resume();
      scanTlRef.current?.resume();
    }, 120);
  };

  const zoomIn  = () => { const c = canvasRef.current; if (c) applyZoom( 0.3, cW(c) / 2, cH(c) / 2); };
  const zoomOut = () => { const c = canvasRef.current; if (c) applyZoom(-0.3, cW(c) / 2, cH(c) / 2); };

  // ── Render ────────────────────────────────────────────────────────────────────
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

      {/* ── Pin marker ────────────────────────────────────────────────────────── */}
      {/* Outer: GPU-composited position wrapper, always at top:0 left:0 */}
      <div
        ref={markerPosRef}
        className="absolute pointer-events-none"
        style={{ top: 0, left: 0, zIndex: 15, willChange: 'transform' }}
      >
        {/* Inner: GSAP animates y/scale/opacity; margins center the needle tip */}
        <div
          ref={markerRef}
          style={{ opacity: 0, marginLeft: -20, marginTop: -54 }}
        >
          {/* Pulse ring at needle tip */}
          <div style={{
            position: 'absolute',
            bottom: -4,
            left: '50%',
            width: 22, height: 22,
            borderRadius: '50%',
            background: 'rgba(200,48,58,0.14)',
            animation: 'pinRing 1.5s ease-out infinite',
          }} />

          {/* Hornet-inspired mask marker — 40×54 SVG, needle tip at bottom center */}
          <svg
            width="40" height="54" viewBox="0 0 40 54"
            fill="none" xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <radialGradient id="mg" cx="50%" cy="38%" r="62%">
                <stop offset="0%" stopColor="#F0E6D0" />
                <stop offset="100%" stopColor="#BBAA8A" />
              </radialGradient>
            </defs>

            {/* Left horn */}
            <path d="M14 16 C12 9 9 4 7 0 C9 6 11 11 13 18" fill="#C9963D" opacity="0.9" />
            <path d="M13 18 C11 11 9 6 7 0" stroke="#C9963D" strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.5" />

            {/* Right horn */}
            <path d="M26 16 C28 9 31 4 33 0 C31 6 29 11 27 18" fill="#C9963D" opacity="0.9" />
            <path d="M27 18 C29 11 31 6 33 0" stroke="#C9963D" strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.5" />

            {/* Mask face */}
            <ellipse cx="20" cy="24" rx="13" ry="11" fill="url(#mg)" stroke="#C9963D" strokeWidth="1.1" />

            {/* Eye slits */}
            <ellipse cx="14" cy="22" rx="3.2" ry="1.7" fill="#110810" />
            <ellipse cx="26" cy="22" rx="3.2" ry="1.7" fill="#110810" />

            {/* Chin accent */}
            <path d="M15 29 Q20 33 25 29" stroke="#C8303A" strokeWidth="1.4" strokeLinecap="round" fill="none" />

            {/* Needle */}
            <path d="M16 33 L20 52 L24 33" fill="#C8303A" stroke="#8B1A22" strokeWidth="0.7" strokeLinejoin="round" />
          </svg>

          {/* Cell number inside mask */}
          {selected && (
            <div style={{
              position: 'absolute',
              top: 17,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: 'Inter, sans-serif',
              fontSize: selected > 9999 ? 6 : selected > 999 ? 7 : 9,
              fontWeight: 700,
              color: '#110810',
              letterSpacing: '0.01em',
              lineHeight: 1,
            }}>
              {selected.toString().padStart(PAD, '0')}
            </div>
          )}
        </div>
      </div>

      {/* Scan line */}
      <div
        ref={scanRef}
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          height: 2,
          background: 'linear-gradient(90deg, transparent 0%, rgba(201,150,61,0.28) 30%, rgba(201,150,61,0.55) 50%, rgba(201,150,61,0.28) 70%, transparent 100%)',
          filter: 'blur(1px)',
          top: '-4px',
          opacity: 0,
          zIndex: 5,
        }}
      />

      {/* Loading overlay */}
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50" style={{ background: '#09080F' }}>
          <p style={{
            fontFamily: 'Tajawal, sans-serif',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--accent-gold)',
            letterSpacing: '0.06em',
          }}>
            جارٍ تحميل خريطة فارلوم…
          </p>
          <div style={{
            marginTop: 16,
            width: 160,
            height: 1,
            background: 'linear-gradient(90deg, transparent, var(--accent-gold), transparent)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </div>
      )}

      {/* Zoom controls */}
      {ready && (
        <div className="absolute flex flex-col gap-1.5 z-20" style={{ bottom: 104, left: 12 }}>
          {[
            { label: '+',  fn: zoomIn,    title: 'تكبير',       fs: 22 },
            { label: '−',  fn: zoomOut,   title: 'تصغير',       fs: 22 },
            { label: '⌖', fn: resetView, title: 'إعادة الضبط', fs: 18 },
          ].map(({ label, fn, title, fs }) => (
            <button
              key={label}
              onClick={fn}
              aria-label={title}
              title={title}
              className="flex items-center justify-center"
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(9,8,15,0.88)',
                border: '1px solid rgba(201,150,61,0.18)',
                color: 'var(--accent-gold)',
                fontFamily: 'Inter, sans-serif',
                fontSize: fs,
                fontWeight: 500,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                touchAction: 'manipulation',
                cursor: 'pointer',
                transition: 'border-color 0.18s, color 0.18s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget;
                el.style.borderColor = 'rgba(201,150,61,0.45)';
                el.style.color = '#EDE0C4';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget;
                el.style.borderColor = 'rgba(201,150,61,0.18)';
                el.style.color = 'var(--accent-gold)';
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
