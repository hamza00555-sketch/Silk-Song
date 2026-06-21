'use client';

import { useRef, useState, useEffect, KeyboardEvent } from 'react';
import { gsap } from 'gsap';

const COLS  = 80;
const ROWS  = 56;
const TOTAL = COLS * ROWS;

interface Props {
  selected: number | null;
  onSelect: (n: number | null) => void;
  onReset:  () => void;
  compact?: boolean; // mobile bottom bar mode
}

export default function SidePanel({ selected, onSelect, onReset, compact = false }: Props) {
  const panelRef  = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const [query,   setQuery]   = useState('');
  const [error,   setError]   = useState('');
  const [flash,   setFlash]   = useState(false);

  // entrance animation
  useEffect(() => {
    if (!panelRef.current) return;
    gsap.fromTo(panelRef.current,
      { opacity: 0, x: compact ? 0 : 32, y: compact ? 40 : 0 },
      { opacity: 1, x: 0, y: 0, duration: 0.55, ease: 'power2.out', delay: 0.15 }
    );
  }, [compact]);

  // flash selected info when it changes
  useEffect(() => {
    if (!selected) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [selected]);

  const handleSearch = () => {
    const n = parseInt(query.trim(), 10);
    if (isNaN(n) || n < 1 || n > TOTAL) {
      setError(`No cell found. Enter 1 – ${TOTAL.toLocaleString()}.`);
      gsap.fromTo(inputRef.current,
        { x: -6 }, { x: 0, duration: 0.35, ease: 'elastic.out(1,0.4)' }
      );
      return;
    }
    setError('');
    onSelect(n);
    if ((window as any).__mapFocusCell) (window as any).__mapFocusCell(n);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  const row    = selected ? Math.ceil(selected / COLS) : null;
  const col    = selected ? ((selected - 1) % COLS) + 1 : null;

  if (compact) {
    return (
      <div
        ref={panelRef}
        className="glass w-full"
        style={{ borderTop: '1px solid var(--border)', opacity: 0 }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Search */}
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={TOTAL}
            value={query}
            onChange={e => { setQuery(e.target.value); setError(''); }}
            onKeyDown={onKey}
            placeholder="Cell number…"
            className="flex-1 bg-transparent font-crimson text-sm outline-none"
            style={{
              color: 'var(--cream)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '7px 10px',
              minWidth: 0,
            }}
          />
          <button
            onClick={handleSearch}
            className="font-cinzel text-xs px-3 py-2 rounded"
            style={{
              background: 'linear-gradient(135deg, var(--accent-red), #8B1A22)',
              color: 'var(--cream)',
              border: '1px solid rgba(200,48,58,0.4)',
              minHeight: 38,
              whiteSpace: 'nowrap',
            }}
          >
            GO
          </button>
          <button
            onClick={onReset}
            className="font-cinzel text-xs px-3 py-2 rounded"
            style={{
              background: 'var(--surface)',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              minHeight: 38,
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <p className="px-3 pb-2 text-xs" style={{ color: 'var(--accent-red)' }}>{error}</p>
        )}

        {selected && (
          <div
            className="flex items-center gap-4 px-3 pb-3"
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 8,
              animation: flash ? 'fadeSlideIn 0.35s ease' : undefined,
            }}
          >
            <div className="text-center">
              <p className="font-cinzel text-xs" style={{ color: 'var(--muted)' }}>CELL</p>
              <p className="font-cinzel-deco" style={{ color: 'var(--accent-gold)', fontSize: 18, lineHeight: 1.2 }}>
                {selected.toString().padStart(4,'0')}
              </p>
            </div>
            <div className="divider" style={{ width: 1, height: 36, background: 'var(--border)' }} />
            <div className="flex gap-4 text-center">
              <div>
                <p className="font-cinzel text-xs" style={{ color: 'var(--muted)' }}>ROW</p>
                <p className="font-cinzel" style={{ color: 'var(--cream)', fontSize: 14 }}>{row}</p>
              </div>
              <div>
                <p className="font-cinzel text-xs" style={{ color: 'var(--muted)' }}>COL</p>
                <p className="font-cinzel" style={{ color: 'var(--cream)', fontSize: 14 }}>{col}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Desktop side panel ───────────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      className="glass flex flex-col gap-0 overflow-hidden"
      style={{
        width: 260,
        minWidth: 260,
        height: '100%',
        opacity: 0,
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <p className="font-cinzel-deco text-xs tracking-widest" style={{ color: 'var(--accent-gold)' }}>
          SILK·SONG
        </p>
        <h1 className="font-cinzel text-lg mt-1 leading-tight" style={{ color: 'var(--cream)' }}>
          Map of Pharloom
        </h1>
        <p className="font-crimson text-xs mt-1 italic" style={{ color: 'var(--muted)' }}>
          {COLS}×{ROWS} grid · {TOTAL.toLocaleString()} cells
        </p>
      </div>

      <div className="divider mx-5" />

      {/* Search */}
      <div className="px-5 pt-4 pb-3">
        <label className="font-cinzel text-xs block mb-2 tracking-wider" style={{ color: 'var(--muted)' }}>
          FIND CELL
        </label>
        <input
          ref={inputRef}
          type="number"
          min={1}
          max={TOTAL}
          value={query}
          onChange={e => { setQuery(e.target.value); setError(''); }}
          onKeyDown={onKey}
          placeholder={`1 – ${TOTAL.toLocaleString()}`}
          className="w-full bg-transparent font-crimson text-sm outline-none"
          style={{
            color: 'var(--cream)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.3)',
          }}
        />
        {error && (
          <p className="mt-2 text-xs font-crimson" style={{ color: 'var(--accent-red)' }}>{error}</p>
        )}
        <button
          onClick={handleSearch}
          className="w-full mt-3 font-cinzel text-xs py-2 rounded tracking-widest"
          style={{
            background: 'linear-gradient(135deg, #8B1A22, var(--accent-red))',
            color: 'var(--cream)',
            border: '1px solid rgba(200,48,58,0.35)',
            letterSpacing: '0.18em',
          }}
          onMouseEnter={e => gsap.to(e.currentTarget, { scale: 1.03, duration: 0.18 })}
          onMouseLeave={e => gsap.to(e.currentTarget, { scale: 1, duration: 0.18 })}
          onMouseDown={e => gsap.to(e.currentTarget, { scale: 0.97, duration: 0.1 })}
          onMouseUp={e => gsap.to(e.currentTarget, { scale: 1.03, duration: 0.15 })}
        >
          LOCATE
        </button>
      </div>

      <div className="divider mx-5" />

      {/* Selected info */}
      <div className="px-5 pt-4 flex-1">
        <p className="font-cinzel text-xs tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
          SELECTED COORDINATE
        </p>

        {selected ? (
          <div
            className="rounded p-4"
            style={{
              background: 'rgba(200,48,58,0.08)',
              border: '1px solid rgba(200,48,58,0.25)',
              animation: flash ? 'fadeSlideIn 0.35s ease' : undefined,
            }}
          >
            {/* Big number */}
            <div className="text-center mb-3">
              <p className="font-cinzel-deco" style={{ fontSize: 36, color: 'var(--accent-gold)', lineHeight: 1.1 }}>
                {selected.toString().padStart(4, '0')}
              </p>
              <p className="font-crimson text-xs italic mt-1" style={{ color: 'var(--muted)' }}>
                coordinate
              </p>
            </div>

            <div className="divider" />

            <div className="flex justify-around mt-3">
              <div className="text-center">
                <p className="font-cinzel text-xs" style={{ color: 'var(--muted)' }}>ROW</p>
                <p className="font-cinzel mt-1" style={{ color: 'var(--cream)', fontSize: 22 }}>{row}</p>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div className="text-center">
                <p className="font-cinzel text-xs" style={{ color: 'var(--muted)' }}>COL</p>
                <p className="font-cinzel mt-1" style={{ color: 'var(--cream)', fontSize: 22 }}>{col}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="font-crimson text-sm italic" style={{ color: 'var(--muted)' }}>
              Hover or tap a cell<br />to reveal its coordinate
            </p>
          </div>
        )}
      </div>

      {/* Reset */}
      <div className="px-5 pb-6 pt-3">
        <div className="divider mb-4" />
        <button
          onClick={onReset}
          className="w-full font-cinzel text-xs py-2 rounded tracking-widest"
          style={{
            background: 'rgba(0,0,0,0.3)',
            color: 'var(--muted)',
            border: '1px solid var(--border)',
            letterSpacing: '0.14em',
          }}
          onMouseEnter={e => gsap.to(e.currentTarget, { borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)', duration: 0.2 })}
          onMouseLeave={e => gsap.to(e.currentTarget, { borderColor: 'var(--border)', color: 'var(--muted)', duration: 0.2 })}
        >
          RESET VIEW
        </button>

        <p className="text-center font-crimson text-xs italic mt-4" style={{ color: 'rgba(237,224,196,0.2)' }}>
          Team Cherry · Pharloom
        </p>
      </div>
    </div>
  );
}
