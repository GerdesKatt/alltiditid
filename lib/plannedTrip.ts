/**
 * En planerad resa från reseplaneraren, sparad som Min resa. Bara i den egna webbläsaren.
 * Resan tas bort av sig själv när den är framme sedan en timme.
 */
export type PlanPoint = { name: string; time: string; rtTime: string; track: string; date?: string };
export type PlanLeg =
  | { kind: 'walk'; from: PlanPoint; to: PlanPoint; minutes: number; meters: number }
  | {
      kind: 'ride';
      mode: string;
      line: string;
      direction: string;
      operator?: string;
      from: PlanPoint;
      to: PlanPoint;
      minutes: number;
      cancelled: boolean;
    };
export type PlanTrip = {
  dep: string;
  arr: string;
  depDate: string;
  arrDate: string;
  minutes: number;
  changes: number;
  legs: PlanLeg[];
};
export type PlannedTrip = { to: string; from: string; trip: PlanTrip; savedAt: number };

const KEY = 'alltiditid:planerad-resa';

/** "2026-11-27" + "07:12" → millisekunder, i svensk tid (telefonens klocka). */
export function at(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0).getTime();
}

export function loadPlannedTrip(now = Date.now()): PlannedTrip | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PlannedTrip;
    if (!p || !p.trip || !p.trip.legs) return null;
    const done = at(p.trip.arrDate || p.trip.depDate, p.trip.arr);
    if (Number.isFinite(done) && now > done + 60 * 60_000) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function storePlannedTrip(p: PlannedTrip | null) {
  try {
    if (p) window.localStorage.setItem(KEY, JSON.stringify(p));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Privat läge: resan gäller bara den här visningen.
  }
}

/** "i dag", "i morgon", "fre 28 nov" */
export function dayLabel(date: string, now: number, lang: 'sv' | 'en'): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((at(date, '00:00') - start.getTime()) / 86_400_000);
  if (diff === 0) return lang === 'en' ? 'today' : 'i dag';
  if (diff === 1) return lang === 'en' ? 'tomorrow' : 'i morgon';
  return new Date(at(date, '12:00')).toLocaleDateString(lang === 'en' ? 'en-GB' : 'sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
