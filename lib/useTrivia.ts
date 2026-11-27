import { useEffect, useState } from 'react';
import type { Trivia } from './trivia.mjs';

/** Samma svar till tavlans "När du väntar" och till "Om stationen", utan ett andra anrop. */
const memo = new Map<string, Promise<Trivia | null>>();

function load(name: string, coords: { lat: number; lon: number } | null, lang: 'sv' | 'en'): Promise<Trivia | null> {
  const qs = new URLSearchParams({ action: 'trivia', name, lang });
  if (coords) {
    qs.set('lat', coords.lat.toFixed(3));
    qs.set('lon', coords.lon.toFixed(3));
  }
  const key = qs.toString();
  let p = memo.get(key);
  if (!p) {
    p = fetch(`/api/trafik?${key}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => (b && b.trivia && b.trivia.text ? (b.trivia as Trivia) : null))
      .catch(() => null);
    p.then((v) => {
      // Ett misslyckat svar ska kunna hämtas igen nästa gång.
      if (!v) memo.delete(key);
    });
    memo.set(key, p);
  }
  return p;
}

/**
 * Kuriosan för en hållplats, hämtad först när den behövs (enabled).
 * undefined = hämtas, null = inget att visa.
 */
export function useTrivia(
  name: string,
  coords: { lat: number; lon: number } | null,
  lang: 'sv' | 'en',
  enabled = true
): Trivia | null | undefined {
  const [trivia, setTrivia] = useState<Trivia | null | undefined>(undefined);
  const lat = coords?.lat;
  const lon = coords?.lon;
  useEffect(() => {
    setTrivia(undefined);
    if (!enabled || !name) return;
    let alive = true;
    load(name, lat !== undefined && lon !== undefined ? { lat, lon } : null, lang).then((v) => {
      if (alive) setTrivia(v);
    });
    return () => {
      alive = false;
    };
  }, [name, lat, lon, lang, enabled]);
  return trivia;
}
