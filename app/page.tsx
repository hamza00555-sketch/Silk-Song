'use client';

import { useState, useCallback } from 'react';
import MapView   from './components/MapView';
import SidePanel from './components/SidePanel';

export default function Home() {
  const [selected, setSelected] = useState<number | null>(null);

  const handleReset = useCallback(() => {
    setSelected(null);
    if (typeof window !== 'undefined' && (window as any).__mapResetView) {
      (window as any).__mapResetView();
    }
  }, []);

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'row-reverse', background: '#09080F', overflow: 'hidden' }}>

      {/* Desktop: side panel (right side in RTL) */}
      <div className="hidden md:flex">
        <SidePanel selected={selected} onSelect={setSelected} onReset={handleReset} />
      </div>

      {/* Map fills remaining space */}
      <div className="flex-1 relative overflow-hidden">
        <MapView selected={selected} onSelect={setSelected} />
      </div>

      {/* Mobile: bottom panel */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 z-30">
        <SidePanel selected={selected} onSelect={setSelected} onReset={handleReset} compact />
      </div>
    </div>
  );
}
