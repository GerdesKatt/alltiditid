// Veckans kvitto (Vägen till 10 del 2, idé 7): veckan räknas måndag till söndag.

/** Måndagen i veckan för ett datum, 'YYYY-MM-DD'. */
export function weekStart(date) {
  const [y, m, d] = String(date || '').split('-').map(Number);
  const day = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const back = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - back);
  return day.toISOString().slice(0, 10);
}

/** Resor framme samma vecka som `today`, och hur många som var i tid (högst 2 min sena). */
export function weekTally(notes, today) {
  const week = weekStart(today);
  const mine = (Array.isArray(notes) ? notes : []).filter((n) => weekStart(n.d) === week);
  return { total: mine.length, onTime: mine.filter((n) => (n.late || 0) <= 2).length };
}
