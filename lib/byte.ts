/**
 * Bytet: en sparad anslutning på en station längs "Mitt tåg", och bedömningen om man hinner.
 * Delas av tågets hela resa (TrainSheet) och kortet under Min resa (MyTrainCard).
 */
export type SavedByte = { train: string; station: string; line: string; destination: string; scheduledTime: string };

export type Connection = {
  id: string;
  line: string;
  destination: string;
  scheduledTime: string;
  expectedAt?: string;
  newTime?: string;
  status: string;
  track?: string;
  margin: number | null;
};

type Part = { scheduled: string; estimated?: string; actual?: string };
type JourneyLike = { date?: string; stops: { arrival?: Part; departure?: Part }[] };

const BYTE_KEY = 'alltiditid:byte';

export function loadByte(train: string): SavedByte | null {
  try {
    const b = JSON.parse(window.localStorage.getItem(BYTE_KEY) || 'null');
    return b && b.train === train ? b : null;
  } catch {
    return null;
  }
}

export function storeByte(b: SavedByte | null): void {
  try {
    if (b) window.localStorage.setItem(BYTE_KEY, JSON.stringify(b));
    else window.localStorage.removeItem(BYTE_KEY);
  } catch {
    // Valet gäller tills sidan laddas om.
  }
}

/** Väntad ankomst som 'YYYY-MM-DDTHH:MM'. Tider före första avgången hör till nästa dag. */
export function arrivalAt(journey: JourneyLike, stop: { arrival?: Part }): string {
  const hhmm = stop.arrival?.actual || stop.arrival?.estimated || stop.arrival?.scheduled;
  if (!hhmm || !journey.date) return '';
  const first = journey.stops[0]?.departure?.scheduled || '00:00';
  let date = journey.date;
  if (hhmm < first) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    date = d.toISOString().slice(0, 10);
  }
  return `${date}T${hhmm}`;
}

export type Verdict = { text: string; tone: 'ok' | 'tight' | 'miss' };

export function verdict(c: Pick<Connection, 'status' | 'margin'>, transfer: number): Verdict {
  if (c.status === 'cancelled') return { text: 'Inställd', tone: 'miss' };
  if (c.margin === null) return { text: '', tone: 'ok' };
  if (c.margin < 0) return { text: 'Missar', tone: 'miss' };
  if (c.margin <= 1) return { text: 'Hinner troligen inte', tone: 'miss' };
  if (c.margin < transfer) return { text: `Tight · ${c.margin} min`, tone: 'tight' };
  return { text: `Hinner · ${c.margin} min`, tone: 'ok' };
}

/** Från så här många minuters försening vid ankomst kan man ha rätt till ersättning. */
export const COMPENSATION_DELAY_MIN = 20;
