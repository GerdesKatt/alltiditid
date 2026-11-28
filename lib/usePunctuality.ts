import { useEffect, useState } from 'react';
import { punctualityKey } from './punctuality.mjs';

type Lines = Record<string, { late: number; n: number; weekday: boolean }>;
const memo = new Map<string, Promise<Lines>>();

function parts(now: number): { hour: string; weekday: number } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { hour: String(p.hour).padStart(2, '0'), weekday: Math.max(0, days.indexOf(String(p.weekday))) };
}

/**
 * "Brukar vara sen" (Vägen till 10, idé 12): ett anrop per hållplats och timme, delat av alla rader.
 * Svarar med en funktion som ger radens text, eller '' när linjen brukar gå i tid eller mätningar saknas.
 */
export function usePunctuality(stopId: string, now: number, enabled: boolean, lang: 'sv' | 'en') {
  const { hour, weekday } = parts(now);
  const [lines, setLines] = useState<Lines>({});
  useEffect(() => {
    if (!enabled || !stopId) {
      setLines({});
      return;
    }
    const key = `${stopId}|${hour}|${weekday}`;
    let p = memo.get(key);
    if (!p) {
      p = fetch(`/api/trafik?action=punctuality&stopId=${encodeURIComponent(stopId)}&hour=${hour}&weekday=${weekday}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => (b && b.lines && typeof b.lines === 'object' ? (b.lines as Lines) : {}))
        .catch(() => ({}));
      memo.set(key, p);
    }
    let alive = true;
    p.then((v) => alive && setLines(v));
    return () => {
      alive = false;
    };
  }, [stopId, hour, weekday, enabled]);

  const daySv = ['söndagar', 'måndagar', 'tisdagar', 'onsdagar', 'torsdagar', 'fredagar', 'lördagar'][weekday];
  const dayEn = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][weekday];
  const h = String(Number(hour));
  /**
   * Historiken säger något bara där realtiden ännu inte gör det: avgångar utan realtid, eller
   * långt fram (mer än 20 min) innan förseningen hunnit synas. Annars säger raden emot sig själv (N4).
   * Texten är en marginal att räkna med, inte en andra tid: "Brukar bli 3 min sen. Räkna med 11:16."
   */
  return (line: string, destination: string, opts: { realtime: boolean; minutesLeft: number | null; clock: string }): string => {
    const hit = lines[punctualityKey(line, destination)];
    if (!hit) return '';
    if (opts.realtime && (opts.minutesLeft === null || opts.minutesLeft <= LOOKAHEAD_MIN)) return '';
    const m = /^(\d{1,2}):(\d{2})$/.exec(opts.clock);
    const expect = m ? (() => {
      const total = (Number(m[1]) * 60 + Number(m[2]) + hit.late) % (24 * 60);
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    })() : '';
    const when = hit.weekday ? daySv : `kl. ${h}`;
    const whenEn = hit.weekday ? dayEn : `around ${h}:00`;
    if (lang === 'en') return `Usually ${hit.late} min late ${whenEn}.${expect ? ` Count on ${expect}.` : ''}`;
    return `Brukar bli ${hit.late} min sen ${when}.${expect ? ` Räkna med ${expect}.` : ''}`;
  };
}

/** Så långt fram (minuter) visar realtiden ofta ännu inte förseningen. */
export const LOOKAHEAD_MIN = 20;
