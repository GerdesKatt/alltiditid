/**
 * "Dela ankomst" på Mitt tåg-kortet: ett färdigt meddelande till den som hämtar, t.ex.
 *   "Jag är framme i Lund C 18:42 (5 min sent). Sitter på SJ Snabbtåg 537."
 * Tiden är den väntade när det finns realtid, annars tidtabellens (och då sägs inget om i tid).
 */
export function buildArrivalMessage({ train, stop, scheduled, expected, delay }, lang = 'sv') {
  const time = expected || scheduled;
  const late = Number(delay) > 0 ? Math.round(Number(delay)) : 0;
  const live = Boolean(expected);
  if (lang === 'en') {
    const status = late ? ` (${late} min late)` : live ? ' (on time)' : '';
    return `I'll be at ${stop} at ${time}${status}. I'm on ${train}.`;
  }
  const status = late ? ` (${late} min sent)` : live ? ' (i tid)' : '';
  return `Jag är framme i ${stop} ${time}${status}. Sitter på ${train}.`;
}
