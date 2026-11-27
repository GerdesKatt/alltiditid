import { stockholmDay } from './sweTime.mjs';

/**
 * Hur många olika dagar (svensk tid) de senaste 7 dygnen som en tavla visats.
 * Räknas ur besöken som redan sparas för Hem; ingenting nytt sparas för mätningen.
 * @param {{ t: number }[]} list
 * @param {number} now
 */
export function activeDays(list, now = Date.now()) {
  const days = new Set();
  for (const v of list) if (now - v.t < 7 * 86_400_000) days.add(stockholmDay(v.t));
  return days.size;
}
