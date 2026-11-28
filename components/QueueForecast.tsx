'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useLang } from '../lib/i18n';
import { colors, fonts } from './styles';

type Cell = { hour: number; typical: number | null; low: number | null; high: number | null; days: number; basis: 'same' | 'group' | 'dow' | null };
type QueueRow = { name: string; fastTrack: boolean; hours: Cell[] };
type DepHour = { hour: number; n: number; usual: number | null; busy: boolean };
type DayClass = 'helgdag' | 'resdag' | 'sommar' | 'lov' | 'vanlig';
type Forecast = {
  date: string;
  dayClass: DayClass;
  dayOfWeek: number;
  holiday: string | null;
  queues: QueueRow[];
  departures: DepHour[];
  historyDays: number;
};

const DOW_PLURAL_SV = ['söndagar', 'måndagar', 'tisdagar', 'onsdagar', 'torsdagar', 'fredagar', 'lördagar'];
const DOW_PLURAL_EN = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const DOW_SHORT_SV = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
const DOW_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Dagens datum i svensk tid, plus n dagar. */
function swedishDay(n: number): string {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  return new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}
const dowOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Färg efter typisk kötid: ju längre kö, desto starkare orange. */
function cellStyle(minutes: number | null): React.CSSProperties {
  if (minutes === null) return { border: `1px dashed ${colors.border}`, backgroundColor: 'transparent' };
  const pct = minutes >= 30 ? 100 : minutes >= 20 ? 70 : minutes >= 10 ? 40 : 15;
  return { border: 'none', backgroundColor: `color-mix(in srgb, ${colors.amber} ${pct}%, transparent)` };
}

/**
 * "Brukar vara": typiska kötider per timme för en dag (i dag och sex dagar framåt),
 * byggt på vår egen köhistorik och med hänsyn till röda dagar, lov och sommar,
 * plus avgångar per timme jämfört med en vanlig sådan veckodag.
 */
export default function QueueForecast({ airport }: { airport: string }) {
  const { lang, t } = useLang();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => swedishDay(i)), []);
  const [date, setDate] = useState(days[1]);
  const [data, setData] = useState<Forecast | null>(null);
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    fetch(`/api/trafik?action=queueforecast&airport=${airport}&date=${date}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => active && setData(d && Array.isArray(d.queues) ? d : null))
      .catch(() => active && setData(null));
    return () => {
      active = false;
    };
  }, [airport, date]);

  const queues = useMemo(() => (data ? data.queues : []), [data]);
  const hours = data && (queues[0]?.hours.map((c) => c.hour) || data.departures.map((d) => d.hour));
  const hasHistory = queues.some((q) => q.hours.some((c) => c.typical !== null));

  // Förvald timme: den som brukar vara värst, annars kl. 7.
  const selected = useMemo(() => {
    if (hour !== null) return hour;
    let best: { hour: number; v: number } | null = null;
    for (const q of queues) for (const c of q.hours) if (c.typical !== null && (!best || c.typical > best.v)) best = { hour: c.hour, v: c.typical };
    return best ? best.hour : 7;
  }, [hour, queues]);

  if (!data || !hours || !hours.length) return null;

  const dowPlural = (lang === 'en' ? DOW_PLURAL_EN : DOW_PLURAL_SV)[data.dayOfWeek];
  const basisText = (basis: Cell['basis']): string => {
    const weekend = data.dayOfWeek === 0 || data.dayOfWeek === 6;
    const cls = data.dayClass;
    if (basis === 'dow') return t(`alla ${dowPlural}`, `all ${dowPlural}`);
    if (cls === 'helgdag') return t('röda dagar', 'public holidays');
    if (cls === 'resdag') return t('dagar före långhelg', 'days before a long weekend');
    if (basis === 'same') {
      if (cls === 'lov') return t(`${dowPlural} under lov`, `${dowPlural} in school holidays`);
      if (cls === 'sommar') return t(`${dowPlural} på sommaren`, `${dowPlural} in summer`);
      return t(`vanliga ${dowPlural}`, `ordinary ${dowPlural}`);
    }
    if (cls === 'lov') return t('lovdagar', 'school holiday days');
    if (cls === 'sommar') return t('sommardagar', 'summer days');
    return weekend ? t('vanliga helger', 'ordinary weekends') : t('vanliga vardagar', 'ordinary weekdays');
  };
  const dayNote =
    data.holiday ||
    (data.dayClass === 'resdag'
      ? t('Dag före långhelg', 'Day before a long weekend')
      : data.dayClass === 'lov'
        ? t('Lov i delar av landet', 'School holiday in parts of Sweden')
        : data.dayClass === 'sommar'
          ? t('Sommar', 'Summer')
          : null);

  const dep = data.departures.find((d) => d.hour === selected);
  const maxDep = Math.max(1, ...data.departures.map((d) => d.n));
  const cols = `minmax(70px, auto) repeat(${hours.length}, minmax(0, 1fr))`;
  const shortDow = lang === 'en' ? DOW_SHORT_EN : DOW_SHORT_SV;
  const dayLabel = (d: string, i: number) => (i === 0 ? t('I dag', 'Today') : i === 1 ? t('I morgon', 'Tomorrow') : shortDow[dowOf(d)]);
  const pad = (h: number) => String(h).padStart(2, '0');

  return (
    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${colors.border}` }}>
      <div style={{ fontSize: 'var(--fs-2)', fontWeight: 700, color: colors.textDim, marginBottom: '8px' }}>
        {t('Brukar vara', 'Usually')}
      </div>
      <div role="tablist" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {days.map((d, i) => (
          <button
            key={d}
            role="tab"
            aria-selected={d === date}
            onClick={() => {
              setDate(d);
              setHour(null);
            }}
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: 'var(--fs-2)',
              cursor: 'pointer',
              border: `1px solid ${d === date ? colors.accent : colors.borderMuted}`,
              backgroundColor: d === date ? colors.accentTint : 'transparent',
              color: colors.text,
            }}
          >
            {dayLabel(d, i)}
          </button>
        ))}
      </div>
      {dayNote ? <div style={{ fontSize: 'var(--fs-2)', color: colors.amber, marginBottom: '8px' }}>{dayNote}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '2px', alignItems: 'center', fontSize: 'var(--fs-1)' }}>
        <span />
        {hours.map((h) => (
          <span key={h} style={{ textAlign: 'center', color: colors.textFaint, fontSize: 'var(--fs-1)' }}>
            {h % 3 === 0 ? pad(h) : ''}
          </span>
        ))}
        {hasHistory
          ? queues.map((q) => (
              <React.Fragment key={`${q.name}|${q.fastTrack}`}>
                <span style={{ color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '4px' }}>
                  {q.name}
                  {q.fastTrack ? ' FT' : ''}
                </span>
                {q.hours.map((c) => (
                  <button
                    key={c.hour}
                    aria-label={`${q.name} ${pad(c.hour)}: ${c.typical === null ? t('ingen data', 'no data') : `${c.typical} min`}`}
                    onClick={() => setHour(c.hour)}
                    style={{
                      height: '22px',
                      padding: 0,
                      borderRadius: '3px',
                      cursor: 'pointer',
                      outline: c.hour === selected ? `2px solid ${colors.text}` : 'none',
                      outlineOffset: '-1px',
                      ...cellStyle(c.typical),
                    }}
                  />
                ))}
              </React.Fragment>
            ))
          : null}
        {data.departures.length ? (
          <>
            <span style={{ color: colors.textDim, paddingRight: '4px' }}>{t('Avgångar', 'Departures')}</span>
            {hours.map((h) => {
              const d = data.departures.find((x) => x.hour === h);
              const n = d ? d.n : 0;
              return (
                <button
                  key={h}
                  aria-label={`${pad(h)}: ${n} ${t('avgångar', 'departures')}`}
                  onClick={() => setHour(h)}
                  style={{ height: '22px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'flex-end', outline: h === selected ? `2px solid ${colors.text}` : 'none', outlineOffset: '-1px', borderRadius: '3px' }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: '100%',
                      height: `${Math.max(2, Math.round((n / maxDep) * 20))}px`,
                      borderRadius: '2px',
                      backgroundColor: d && d.busy ? colors.amber : colors.borderStrong,
                    }}
                  />
                </button>
              );
            })}
          </>
        ) : null}
      </div>

      <p style={{ fontSize: 'var(--fs-2)', color: colors.text, margin: '10px 0 0' }}>
        <strong style={{ fontFamily: fonts.display }}>
          {t('Kl.', 'At')} {pad(selected)}–{pad(selected + 1)}
        </strong>
        {hasHistory
          ? queues
              .map((q) => ({ q, c: q.hours.find((c) => c.hour === selected) }))
              .filter((x) => x.c && x.c.typical !== null)
              .map(({ q, c }) => (
                <span key={`${q.name}|${q.fastTrack}`}>
                  {' · '}
                  {q.name}
                  {q.fastTrack ? ' FastTrack' : ''}{' '}
                  {c!.low === c!.high ? `ca ${c!.typical} min` : `${c!.low}–${c!.high} min`}
                </span>
              ))
          : null}
        {dep ? (
          <span>
            {' · '}
            {dep.n} {t('avgångar', 'departures')}
            {dep.busy ? <strong style={{ color: colors.amber }}> {t('(fler än vanligt)', '(more than usual)')}</strong> : null}
          </span>
        ) : null}
      </p>
      <p style={{ fontSize: 'var(--fs-1)', color: colors.textDim, margin: '4px 0 0' }}>
        {hasHistory
          ? (() => {
              const c = queues.map((q) => q.hours.find((x) => x.hour === selected)).find((x) => x && x.typical !== null);
              return c
                ? t(
                    `Snitt från ${c.days} ${basisText(c.basis)} vi mätt. Ett riktmärke, inte en garanti.`,
                    `Average of ${c.days} ${basisText(c.basis)} we measured. A rough guide, not a promise.`
                  )
                : t('Ingen köhistorik för den timmen än.', 'No queue history for that hour yet.');
            })()
          : t(
              'Vi har börjat samla köhistorik. Snitten visas när vi mätt minst tre liknande dagar; tills dess visar staplarna hur många flyg som går.',
              'We have started collecting queue history. Averages appear once we have measured at least three similar days; until then the bars show how many flights leave.'
            )}
      </p>
    </div>
  );
}
