import { track } from './track';
/**
 * "Mitt flyg": ett sparat avgående flyg som visas under Min resa med terminal, gate,
 * boarding och när man senast bör vara vid säkerhetskontrollen. Försvinner av sig
 * själv några timmar efter avgång. Sparas bara i webbläsaren.
 */
export type MyFlight = { airport: string; flightId: string; scheduledAt: string };

const KEY = 'alltiditid:mitt-flyg';
/** Händelsen som säger till Min resa att flyget sparats eller tagits bort. */
export const MY_FLIGHT_EVENT = 'alltiditid:mitt-flyg';
/** Så länge efter planerad avgång flyget får ligga kvar (förseningar). */
const KEEP_AFTER_MS = 3 * 3600_000;

function localMs(local: string): number {
  // "YYYY-MM-DDTHH:MM" i svensk tid; en timmes fel spelar ingen roll för gallringen.
  return Date.parse(`${local}:00+01:00`);
}

export function loadMyFlight(now = Date.now()): MyFlight | null {
  try {
    const f = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (!f || !/^[A-Z]{3}$/.test(String(f.airport)) || !/^[A-Z0-9]{2,8}$/.test(String(f.flightId))) return null;
    const at = String(f.scheduledAt || '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) || localMs(at) + KEEP_AFTER_MS < now) return null;
    return { airport: f.airport, flightId: f.flightId, scheduledAt: at };
  } catch {
    return null;
  }
}

export function storeMyFlight(f: MyFlight | null): void {
  if (f) track('nyckel', 0, 'folj_flyg');
  try {
    if (f) window.localStorage.setItem(KEY, JSON.stringify(f));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Gäller tills sidan laddas om.
  }
  try {
    window.dispatchEvent(new Event(MY_FLIGHT_EVENT));
  } catch {
    // Ingen händelse utanför webbläsaren.
  }
}

export function isMyFlight(saved: MyFlight | null, airport: string, flightId: string, scheduledAt: string): boolean {
  return Boolean(saved && saved.airport === airport && saved.flightId === flightId && saved.scheduledAt === scheduledAt);
}
