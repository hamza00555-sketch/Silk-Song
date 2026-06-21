'use client';

import { useRef, useState, KeyboardEvent } from 'react';

const COLS  = 320;
const ROWS  = 224;
const TOTAL = COLS * ROWS;   // 71,680
const PAD   = String(TOTAL).length;  // 5

interface Props {
  selected:     number | null;
  onSelect:     (n: number | null) => void;
  onReset:      () => void;
  onFocusCell:  (n: number) => void;
  compact?:     boolean;
}

const AR  = { fontFamily: 'Tajawal, sans-serif' } as const;
const NUM = { fontFamily: 'Inter, sans-serif'   } as const;

export default function SidePanel({ selected, onSelect, onReset, onFocusCell, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const row = selected ? Math.ceil(selected / COLS) : null;
  const col = selected ? ((selected - 1) % COLS) + 1 : null;

  const handleSearch = () => {
    const n = parseInt(query.trim(), 10);
    if (isNaN(n) || n < 1 || n > TOTAL) {
      setError(`أدخل رقماً بين 1 و ${TOTAL.toLocaleString('ar')}.`);
      inputRef.current?.focus();
      return;
    }
    setError('');
    onSelect(n);
    onFocusCell(n);
    if (compact) setQuery('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  /* ── Mobile bottom sheet ────────────────────────────────────────────────── */
  if (compact) {
    return (
      <div
        className="glass w-full"
        style={{
          borderTop: '1px solid var(--border)',
          direction: 'rtl',
          animation: 'sheetIn 0.4s cubic-bezier(0.22,1,0.36,1) both',
        }}
        aria-label="لوحة البحث"
      >
        {/* Row 1 — search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px' }}>
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={TOTAL}
            value={query}
            onChange={e => { setQuery(e.target.value); setError(''); }}
            onKeyDown={onKey}
            placeholder="رقم الخلية…"
            aria-label="ابحث عن خلية"
            style={{
              flex: 1,
              ...AR,
              fontSize: 16,
              background: 'rgba(255,255,255,0.04)',
              border: error ? '1px solid var(--accent-red)' : '1px solid var(--border)',
              borderRadius: 10,
              padding: '9px 12px',
              color: 'var(--cream)',
              outline: 'none',
              textAlign: 'right',
              minWidth: 0,
            }}
          />
          <button
            onClick={handleSearch}
            aria-label="بحث"
            style={{
              ...AR, fontSize: 14, fontWeight: 600,
              background: 'var(--accent-red)',
              color: 'var(--cream)',
              border: 'none',
              borderRadius: 10,
              height: 42,
              paddingInline: 16,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            بحث
          </button>
          <button
            onClick={() => { onReset(); setQuery(''); setError(''); }}
            aria-label="إعادة تعيين"
            style={{
              ...NUM, fontSize: 16,
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              width: 42, height: 42,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <p role="alert" style={{ ...AR, fontSize: 12, color: 'var(--accent-red)', textAlign: 'right', padding: '0 12px 6px' }}>
            {error}
          </p>
        )}

        {/* Row 2 — coordinate info (fixed height, no resize) */}
        <div
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '6px 12px 10px',
            borderTop: '1px solid var(--border)',
            minHeight: 52,
          }}
        >
          {selected ? (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{ ...AR, fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>الخلية</div>
                <div style={{ ...NUM, fontSize: 20, fontWeight: 600, color: 'var(--accent-gold)', letterSpacing: '0.04em' }}>
                  {selected.toString().padStart(PAD, '0')}
                </div>
              </div>
              <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ ...AR, fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>الصف</div>
                <div style={{ ...NUM, fontSize: 18, fontWeight: 500, color: 'var(--cream)' }}>{row}</div>
              </div>
              <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ ...AR, fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>العمود</div>
                <div style={{ ...NUM, fontSize: 18, fontWeight: 500, color: 'var(--cream)' }}>{col}</div>
              </div>
            </>
          ) : (
            <p style={{ ...AR, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
              اضغط على خلية أو ابحث برقمها
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ── Desktop side panel ─────────────────────────────────────────────────── */
  return (
    <div
      className="glass flex flex-col"
      style={{
        width: 288,
        minWidth: 288,
        height: '100%',
        borderLeft: '1px solid var(--border)',
        direction: 'rtl',
        animation: 'panelIn 0.45s cubic-bezier(0.22,1,0.36,1) both',
        overflow: 'hidden',
      }}
      aria-label="لوحة الخريطة"
    >
      {/* Header */}
      <div style={{ padding: '24px 20px 18px' }}>
        <div style={{
          fontFamily: 'Cinzel, serif',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.2em',
          color: 'var(--accent-gold)',
          marginBottom: 8,
          textTransform: 'uppercase',
        }}>
          SILK·SONG
        </div>
        <h1 style={{ ...AR, fontSize: 20, fontWeight: 700, color: 'var(--cream)', lineHeight: 1.2, marginBottom: 4 }}>
          خريطة فارلوم
        </h1>
        <p style={{ ...AR, fontSize: 12, fontWeight: 300, color: 'var(--muted)' }}>
          {COLS}×{ROWS} شبكة · {TOTAL.toLocaleString('ar')} خلية
        </p>
      </div>

      <div className="divider" style={{ margin: '0 20px' }} />

      {/* Search */}
      <div style={{ padding: '16px 20px 14px' }}>
        <label
          htmlFor="cell-search"
          style={{ ...AR, fontSize: 11, fontWeight: 500, color: 'var(--muted)', display: 'block', textAlign: 'right', marginBottom: 8 }}
        >
          ابحث عن خلية
        </label>
        <input
          id="cell-search"
          ref={inputRef}
          type="number"
          inputMode="numeric"
          min={1}
          max={TOTAL}
          value={query}
          onChange={e => { setQuery(e.target.value); setError(''); }}
          onKeyDown={onKey}
          placeholder={`1 – ${TOTAL.toLocaleString('ar')}`}
          aria-label="رقم الخلية"
          aria-describedby={error ? 'search-error' : undefined}
          style={{
            width: '100%',
            ...NUM,
            fontSize: 16,
            background: 'rgba(255,255,255,0.04)',
            border: error ? '1px solid rgba(200,48,58,0.55)' : '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 14px',
            color: 'var(--cream)',
            outline: 'none',
            textAlign: 'right',
            transition: 'border-color 0.2s',
          }}
        />
        {error && (
          <p
            id="search-error"
            role="alert"
            style={{ ...AR, fontSize: 11, color: 'var(--accent-red)', textAlign: 'right', marginTop: 6 }}
          >
            {error}
          </p>
        )}
        <button
          onClick={handleSearch}
          aria-label="تحديد الموقع"
          style={{
            display: 'block',
            width: '100%',
            marginTop: 10,
            padding: '11px 0',
            background: 'var(--accent-red)',
            border: 'none',
            borderRadius: 10,
            color: 'var(--cream)',
            ...AR,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            transition: 'opacity 0.15s, transform 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          onMouseDown={e  => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
          onMouseUp={e    => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
        >
          تحديد الموقع
        </button>
      </div>

      <div className="divider" style={{ margin: '0 20px' }} />

      {/* Selected coordinate */}
      <div style={{ padding: '16px 20px 0', flex: 1, minHeight: 0 }}>
        <p style={{ ...AR, fontSize: 11, fontWeight: 500, color: 'var(--muted)', textAlign: 'right', marginBottom: 12 }}>
          الإحداثية المحددة
        </p>

        {selected ? (
          <div
            aria-live="polite"
            style={{
              background: 'rgba(200,48,58,0.07)',
              border: '1px solid rgba(200,48,58,0.2)',
              borderRadius: 12,
              padding: '16px',
              animation: 'fadeUp 0.3s ease both',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{
                ...NUM,
                fontSize: 42,
                fontWeight: 600,
                color: 'var(--accent-gold)',
                letterSpacing: '0.06em',
                lineHeight: 1.1,
              }}>
                {selected.toString().padStart(PAD, '0')}
              </div>
              <div style={{ ...AR, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>رقم الخلية</div>
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ ...AR, fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>الصف</div>
                <div style={{ ...NUM, fontSize: 26, fontWeight: 500, color: 'var(--cream)' }}>{row}</div>
              </div>
              <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ ...AR, fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>العمود</div>
                <div style={{ ...NUM, fontSize: 26, fontWeight: 500, color: 'var(--cream)' }}>{col}</div>
              </div>
            </div>
          </div>
        ) : (
          <div aria-live="polite" style={{ textAlign: 'center', padding: '28px 0' }}>
            <p style={{ ...AR, fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
              مرر المؤشر فوق خلية<br />أو ابحث برقمها
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 20px 24px' }}>
        <div className="divider" style={{ marginBottom: 14 }} />
        <button
          onClick={() => { onReset(); setQuery(''); setError(''); }}
          aria-label="إعادة تعيين العرض"
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 0',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--muted)',
            ...AR,
            fontSize: 13,
            fontWeight: 400,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            transition: 'border-color 0.18s, color 0.18s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.borderColor = 'rgba(201,150,61,0.4)';
            el.style.color = 'var(--accent-gold)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.borderColor = 'var(--border)';
            el.style.color = 'var(--muted)';
          }}
        >
          إعادة تعيين العرض
        </button>
        <p style={{ ...AR, fontSize: 11, color: 'rgba(237,224,196,0.18)', textAlign: 'center', marginTop: 16 }}>
          حمزة · فارلوم
        </p>
      </div>
    </div>
  );
}
