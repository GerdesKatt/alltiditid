import { useEffect, useState } from 'react';

type Rain = { wet: boolean; snow: boolean; mm: number } | null;
const memo = new Map<string, Promise<Rain>>();

/**
 * Regn inom en timme vid hållplatsen, bara när gångtiden är på (Vägen till 10, idé 17).
 * Läget avrundas till ungefär en kilometer innan det lämnar telefonen.
 */
export function useRain(at: { lat: number; lon: number } | null): Rain {
  const [rain, setRain] = useState<Rain>(null);
  const key = at ? `${at.lat.toFixed(2)},${at.lon.toFixed(2)}` : '';
  useEffect(() => {
    if (!key) {
      setRain(null);
      return;
    }
    const [lat, lon] = key.split(',');
    let p = memo.get(key);
    if (!p) {
      p = fetch(`/api/trafik?action=rain&lat=${lat}&lon=${lon}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => (b && b.rain ? (b.rain as Rain) : null))
        .catch(() => null);
      memo.set(key, p);
      // Ny prognos efter tio minuter.
      setTimeout(() => memo.delete(key), 10 * 60_000);
    }
    let alive = true;
    p.then((v) => alive && setRain(v));
    return () => {
      alive = false;
    };
  }, [key]);
  return rain;
}
