/**
 * Bytet: en sparad anslutning på en station längs "Mitt tåg", och bedömningen om man hinner.
 * Delas av tågets hela resa (TrainSheet) och kortet under Min resa (MyTrainCard).
 */
import { translator, type Lang } from './lang';

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
  /** Turens id hos Trafiklab, så att turen man sitter på inte räknas som en anslutning. */
  tripId?: string;
  /** Hållplatserna efter bytesstationen (med stops=1), för att söka på ett mål längs linjen. */
  stopsAfter?: string[];
};

type Part = { scheduled: string; estimated?: string; actual?: string };
type JourneyLike = { date?: string; stops: { arrival?: Part; departure?: Part }[] };

const BYTE_KEY = 'alltiditid:byte';
/** Skickas på window när bytet sparas eller tas bort. */
export const BYTE_EVENT = 'alltiditid:byte';

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
  // Kortet under Min resa visar bytet direkt, inte först vid nästa uppdatering.
  try {
    window.dispatchEvent(new Event(BYTE_EVENT));
  } catch {
    // Äldre webbläsare: kortet uppdateras vid nästa hämtning.
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

export function verdict(c: Pick<Connection, 'status' | 'margin'>, transfer: number, lang: Lang = 'sv'): Verdict {
  const t = translator(lang);
  if (c.status === 'cancelled') return { text: t('Inställd', 'Cancelled'), tone: 'miss' };
  if (c.margin === null) return { text: '', tone: 'ok' };
  if (c.margin < 0) return { text: t('Missar', 'Missed'), tone: 'miss' };
  if (c.margin <= 1) return { text: t('Hinner troligen inte', 'Probably too tight'), tone: 'miss' };
  if (c.margin < transfer) return { text: `Tight · ${c.margin} min`, tone: 'tight' };
  return { text: `${t('Hinner', 'OK')} · ${c.margin} min`, tone: 'ok' };
}

/** Från så här många minuters försening vid ankomst kan man ha rätt till ersättning. */
export const COMPENSATION_DELAY_MIN = 20;

/** Marginalen för det sparade bytet, delad från Mitt tåg-kortet till tavlan (Vägen till 10, idé 18). */
export type ByteMargin = {
  station: string;
  line: string;
  scheduledTime: string;
  margin: number | null;
  tone: Verdict['tone'];
  cancelled: boolean;
};
export const BYTE_MARGIN_EVENT = 'alltiditid:byte-margin';
let currentMargin: ByteMargin | null = null;

export function publishByteMargin(m: ByteMargin | null): void {
  const same = JSON.stringify(m) === JSON.stringify(currentMargin);
  currentMargin = m;
  if (same || typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(BYTE_MARGIN_EVENT));
  } catch {
    // Tavlan visar marginalen vid nästa uppdatering.
  }
}

export function currentByteMargin(): ByteMargin | null {
  return currentMargin;
}

/** Texten på raden: "+4 min att byta", "1 min, spring" eller "Missar bytet". */
export function byteRowText(m: Pick<ByteMargin, 'margin' | 'cancelled'>, lang: Lang = 'sv'): { text: string; urgent: boolean } | null {
  const t = translator(lang);
  if (m.cancelled || m.margin === null) return null;
  if (m.margin < 0) return { text: t('Missar bytet', 'Misses the connection'), urgent: true };
  if (m.margin <= 1) return { text: t(`${m.margin} min, spring`, `${m.margin} min, run`), urgent: true };
  return { text: t(`+${m.margin} min att byta`, `+${m.margin} min to change`), urgent: m.margin < 3 };
}
