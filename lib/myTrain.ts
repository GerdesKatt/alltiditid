/**
 * "Mitt tåg": ett sparat tåg (t.ex. 532) som visas överst på startsidan med läge och
 * ankomst. Gäller samma dag; sparas bara i webbläsaren.
 */
/** `off` är stationen man kliver av på, om det inte är slutstationen. */
export type MyTrain = { number: string; date: string; off?: string };

import { stockholmHour } from './sweTime.mjs';
import { track } from './track';

const KEY = 'alltiditid:mitt-tag';

function today(): string {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
  return p; // sv-SE ger 2026-11-26
}

export function loadMyTrain(): MyTrain | null {
  try {
    const t = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (!t || !/^\d{1,6}$/.test(String(t.number))) return null;
    // Ett tåg från i går gäller bara om det fortfarande kan vara på väg (efter midnatt).
    const d = String(t.date || '');
    const yesterday = new Date(Date.parse(`${today()}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    if (d !== today() && !(d === yesterday && stockholmHour(Date.now()) < 4)) return null;
    return { number: String(t.number), date: d, ...(typeof t.off === 'string' && t.off ? { off: t.off } : {}) };
  } catch {
    return null;
  }
}

export function storeMyTrain(t: MyTrain | null): void {
  if (t) track('nyckel', 0, 'folj_tag');
  try {
    if (t) window.localStorage.setItem(KEY, JSON.stringify(t));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Gäller tills sidan laddas om.
  }
}

export function myTrainFor(number: string): MyTrain {
  return { number, date: today() };
}
