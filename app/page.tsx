'use client';

import { useState, useCallback, useRef } from 'react';
import MapView,  { MapViewHandle } from './components/MapView';
import SidePanel from './components/SidePanel';

export default function Home() {
  const [selected, setSelected] = useState<number | null>(null);
  const mapRef = useRef<MapViewHandle>(null);

  const handleReset = useCallback(() => {
    mapRef.current?.resetView();
  }, []);

  const handleFocusCell = useCallback((n: number) => {
    mapRef.current?.focusCell(n);
  }, []);

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'row-reverse', background: '#09080F', overflow: 'hidden' }}>

      {/* Desktop: side panel — right side in RTL layout */}
      <div className="hidden md:flex">
        <SidePanel
          selected={selected}
          onSelect={setSelected}
          onReset={handleReset}
          onFocusCell={handleFocusCell}
        />
      </div>

      {/* Map — fills remaining space */}
      <div className="flex-1 relative overflow-hidden">
        <MapView ref={mapRef} selected={selected} onSelect={setSelected} />
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 z-30">
        <SidePanel
          selected={selected}
          onSelect={setSelected}
          onReset={handleReset}
          onFocusCell={handleFocusCell}
          compact
        />
      </div>
    </div>
  );
}
