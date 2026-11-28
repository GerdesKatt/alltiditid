/**
 * Nedräkningen de sista två minuterna och strecket som tidslinje i Nästa-kortet
 * ("Vägen till 10", idé 1 och 2). Rena funktioner, testade i test/countdown.test.mjs.
 */

/** Under så här många millisekunder kvar räknas det i sekunder. */
export const SECONDS_BELOW_MS = 120_000;
/** Sekunderna går i steg om tio. Under tio sekunder står det "Nu". */
export const SECONDS_STEP = 10;
/** Strecket fylls under de sista tio minuterna före "gå senast" (eller avgången). */
export const TIMELINE_WINDOW_MS = 10 * 60_000;

/**
 * "1 min 40 s" eller "50 s" när det är mellan 10 och 119 sekunder kvar, annars null (vanliga
 * minuter gäller). Avrundat nedåt till tiotal sekunder, så att siffran aldrig lovar mer tid än det
 * finns. Inte "1:40", som läses som ett klockslag bredvid "11:11 → 11:12" (UX-revisionen runda 2, N5).
 * @param {number} msLeft
 * @returns {string | null}
 */
export function secondsLabel(msLeft) {
  if (!Number.isFinite(msLeft) || msLeft >= SECONDS_BELOW_MS) return null;
  const s = Math.floor(msLeft / 1000 / SECONDS_STEP) * SECONDS_STEP;
  if (s < SECONDS_STEP) return null;
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (!min) return `${sec} s`;
  return sec ? `${min} min ${sec} s` : `${min} min`;
}

/**
 * Hur långt strecket är fyllt, 0 till 1: tom tio minuter före "gå senast", full när det är dags.
 * @param {number} msToDeadline Millisekunder till man måste gå (eller till avgången utan gångtid).
 * @param {number} [windowMs]
 */
export function timelineFill(msToDeadline, windowMs = TIMELINE_WINDOW_MS) {
  if (!Number.isFinite(msToDeadline)) return 0;
  const f = 1 - msToDeadline / windowMs;
  return Math.min(1, Math.max(0, f));
}
