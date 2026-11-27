/**
 * Egna mätpunkter utan kakor och utan id: bara händelsens namn och ett tal, räknade
 * per dygn på servern (functions/api/trafik.js, action=event). Ingenting sparas på
 * enheten för mätningens skull. Körs parallellt med Google Analytics tills siffrorna
 * gått att jämföra.
 */
export type TrackName =
  | 'forsta_avgang'
  | 'aterkommande'
  | 'tittade_och_gick'
  | 'byte_snabbt'
  | 'sokavhopp'
  | 'funktion'
  | 'bevakning';

const sent = new Set<string>();

export function track(name: TrackName, value = 0, label = ''): void {
  if (typeof window === 'undefined') return;
  // Samma händelse med samma etikett räknas en gång per sidvisning.
  const once = `${name}|${label}`;
  if (name !== 'funktion' && sent.has(once)) return;
  sent.add(once);
  const body = JSON.stringify({ n: name, v: Math.max(0, Math.round(value)), l: label.slice(0, 32) });
  try {
    const url = '/api/trafik?action=event';
    if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    else fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  } catch {
    // Mätningen får aldrig störa appen.
  }
}
