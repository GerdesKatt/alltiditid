/**
 * "Under 2 min" de sista två minuterna och strecket som tidslinje i Nästa-kortet
 * ("Vägen till 10", idé 1 och 2). Rena funktioner, testade i test/countdown.test.mjs.
 */

/** Under så här många millisekunder kvar säger kortet "under 2 min". */
export const SECONDS_BELOW_MS = 120_000;
/** Strecket fylls under de sista tio minuterna före "gå senast" (eller avgången). */
export const TIMELINE_WINDOW_MS = 10 * 60_000;

/**
 * Sant när det är mellan en och två minuter kvar. Källorna ger hela minuter, så sekunder vore
 * en precision vi inte har (Apple-juryn, runda 2, punkt 1). Kortet säger då "under 2 min".
 * @param {number} msLeft
 */
export function underTwoMinutes(msLeft) {
  return Number.isFinite(msLeft) && msLeft >= 60_000 && msLeft < SECONDS_BELOW_MS;
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
