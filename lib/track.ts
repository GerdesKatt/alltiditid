/**
 * Egna mätpunkter utan kakor och utan id: bara händelsens namn och ett tal, räknade
 * per dygn på servern (functions/api/trafik.js, action=event). Ingenting sparas på
 * enheten för mätningens skull. Sedan 27 nov 2026 den enda mätningen (Google Analytics är borttaget).
 */
export type TrackName =
  | 'forsta_avgang'
  | 'aterkommande'
  | 'tittade_och_gick'
  | 'byte_snabbt'
  | 'sokavhopp'
  | 'funktion'
  | 'bevakning'
  /** Flyg visades minst en gång under besöket (räknas en gång per sidvisning, hur man än kom dit). */
  | 'flygflik'
  /** Dagens första tavla: antal olika dagar med en tavla senaste 7 dygnen (etikett 1–7). */
  | 'aktiva_dagar'
  /** Varifrån besöket kom: sajtens namn ur länken (reddit, google), utm_source eller direkt. */
  | 'kalla'
  /** Dagens och veckans första tavla per enhet (lib/usage.mjs): dag_app, dag_webb, vecka_ny, vecka_ater, vecka_tillbaka. */
  | 'anvandare'
  /** Varje öppning av sajten: app (från hemskärmen) eller webb. */
  | 'oppning'
  /** Nyckelhändelser för statistiksidan: sok, spara_resa, planera_resa, folj_tag, folj_flyg, hemskarm_lagd (Tyck till räknas ur feedback-tabellen). */
  | 'nyckel';

/** Öppnad som installerad app från hemskärmen (inte i en flik i webbläsaren). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

const sent = new Set<string>();

export function track(name: TrackName, value = 0, label = ''): void {
  if (typeof window === 'undefined') return;
  // Automatiska webbläsare (våra egna tester och skärmbilder, robotar) räknas inte.
  if (navigator.webdriver) return;
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
