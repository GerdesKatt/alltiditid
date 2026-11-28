import { stockholmDay } from './sweTime.mjs';

/**
 * Aktiva och återkommande användare utan id (mätningen sedan 28 nov 2026).
 *
 * Räknas ur besöken som redan sparas för Hem (lib/visits.ts), innan det nya besöket läggs till.
 * Ingenting nytt sparas på enheten för mätningens skull, och bara etiketter skickas:
 * - dagens första tavla → "dag", en gång per enhet och dygn (dagliga användare)
 * - veckans första tavla → "ny" (aldrig varit här), "ater" (var här förra veckan)
 *   eller "tillbaka" (har varit här, men inte förra veckan). Summan är veckans användare.
 */

/** Måndagen (YYYY-MM-DD) i den vecka som ett svenskt datum ligger i. */
export function weekStart(day) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const back = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

function minusDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - n));
  return date.toISOString().slice(0, 10);
}

/**
 * @param {{ t: number }[]} list tidigare besök (utan det nya)
 * @param {number} now
 * @returns {{ firstToday: boolean, firstThisWeek: boolean, week: 'ny' | 'ater' | 'tillbaka' }}
 */
export function usageSignals(list, now = Date.now()) {
  const today = stockholmDay(now);
  const thisWeek = weekStart(today);
  const lastWeek = minusDays(thisWeek, 7);
  let firstToday = true;
  let firstThisWeek = true;
  let lastWeekSeen = false;
  let earlier = false;
  for (const v of list) {
    if (!v || typeof v.t !== 'number' || v.t > now) continue;
    const day = stockholmDay(v.t);
    if (day === today) firstToday = false;
    const week = weekStart(day);
    if (week === thisWeek) firstThisWeek = false;
    else if (week === lastWeek) lastWeekSeen = true;
    else if (week < lastWeek) earlier = true;
  }
  const week = lastWeekSeen ? 'ater' : earlier ? 'tillbaka' : 'ny';
  return { firstToday, firstThisWeek, week };
}

/** Vilka etiketter för "nyckel" som räknas på statistiksidan. */
export const KEY_ACTIONS = ['sok', 'spara_resa', 'planera_resa', 'folj_tag', 'folj_flyg', 'tyck_till', 'hemskarm_lagd'];

/**
 * Lägger ihop dygnsrader ur events till veckor, nyast först.
 * @param {{ day: string, name: string, label: string, n: number }[]} rows
 * @param {{ day: string, n: number }[]} feedback antal Tyck till per dygn
 */
export function weeklyStats(rows, feedback = []) {
  const weeks = new Map();
  const get = (day) => {
    const key = weekStart(day);
    if (!weeks.has(key)) {
      weeks.set(key, { week: key, days: new Set(), dag: 0, dagApp: 0, ny: 0, ater: 0, tillbaka: 0, oppningar: 0, oppningarApp: 0, nyckel: {} });
    }
    return weeks.get(key);
  };
  for (const r of rows) {
    const w = get(r.day);
    const n = Number(r.n) || 0;
    if (r.name === 'anvandare') {
      if (r.label === 'dag_app' || r.label === 'dag_webb') {
        w.days.add(r.day);
        w.dag += n;
        if (r.label === 'dag_app') w.dagApp += n;
      } else if (r.label === 'vecka_ny') w.ny += n;
      else if (r.label === 'vecka_ater') w.ater += n;
      else if (r.label === 'vecka_tillbaka') w.tillbaka += n;
    } else if (r.name === 'oppning') {
      w.oppningar += n;
      if (r.label === 'app') w.oppningarApp += n;
    } else if (r.name === 'nyckel' && KEY_ACTIONS.includes(r.label)) {
      w.nyckel[r.label] = (w.nyckel[r.label] || 0) + n;
    }
  }
  for (const f of feedback) {
    const w = get(f.day);
    w.nyckel.tyck_till = (w.nyckel.tyck_till || 0) + (Number(f.n) || 0);
  }
  return Array.from(weeks.values())
    .sort((a, b) => (a.week < b.week ? 1 : -1))
    .map((w) => ({
      week: w.week,
      users: w.ny + w.ater + w.tillbaka,
      returning: w.ater,
      fresh: w.ny,
      comeback: w.tillbaka,
      dailyAvg: w.days.size ? Math.round((w.dag / w.days.size) * 10) / 10 : 0,
      appShare: w.dag ? Math.round((w.dagApp / w.dag) * 100) : 0,
      opens: w.oppningar,
      opensApp: w.oppningarApp,
      actions: w.nyckel,
    }));
}
