import React, { useEffect, useRef, useState } from 'react';
import { colors, fonts } from './styles';
import { arrivalAt, loadByte, storeByte, verdict } from '../lib/byte';
import type { Connection, SavedByte } from '../lib/byte';
import { trackLabel, trainPosition, translator, useLang, type Lang } from '../lib/i18n';

type Part = { scheduled: string; estimated?: string; actual?: string; delay: number };
type Stop = {
  signature: string;
  name: string;
  arrival?: Part;
  departure?: Part;
  track?: string;
  cancelled?: boolean;
  deviation?: string[];
  passed?: boolean;
};
type Journey = {
  number: string;
  date?: string;
  product: string;
  operator?: string;
  from?: string;
  to?: string;
  position?: string;
  stops: Stop[];
  updatedAt?: string;
};

const REFRESH_MS = 60_000;

function stopAction(active: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '0 14px',
    borderRadius: 'var(--radius-control)',
    border: `1px solid ${active ? colors.accentStrong : colors.borderStrong}`,
    backgroundColor: active ? colors.accentStrong : colors.surface,
    color: active ? colors.onAccent : colors.text,
    fontSize: '0.875rem',
    fontWeight: 700,
    cursor: 'pointer',
  };
}
function timeCell(p: Part | undefined, label: string) {
  if (!p) return null;
  const shown = p.actual || p.estimated;
  const late = p.delay > 0;
  return (
    <span style={{ display: 'block', whiteSpace: 'nowrap' }}>
      <span className="sr-only">{label} </span>
      <span style={{ color: shown && shown !== p.scheduled ? colors.textDim : colors.text, textDecoration: shown && shown !== p.scheduled ? 'line-through' : 'none' }}>
        {p.scheduled}
      </span>
      {shown && shown !== p.scheduled ? (
        <span style={{ marginLeft: '6px', fontWeight: 700, color: late ? colors.amber : colors.okText }}>{shown}</span>
      ) : null}
    </span>
  );
}

/** Ett tågs hela resa: var tåget är nu och alla stationer med tider och spår. */
export default function TrainSheet({
  number,
  onClose,
  onOpenStation,
  saved: trainSaved = false,
  onToggleSaved,
}: {
  number: string;
  onClose: () => void;
  /** Visar tavlan för en station på tågets väg. */
  onOpenStation?: (name: string) => void;
  /** Mitt tåg: sparat tåg överst på startsidan. */
  saved?: boolean;
  onToggleSaved?: () => void;
}) {
  const { lang, t } = useLang();
  // Stationen vars val (Byte här, Visa tavlan) är utfällda.
  const [openStop, setOpenStop] = useState<string | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bytet: stationen man byter på, anslutningarna därifrån och det valda bytet.
  const [byteStation, setByteStation] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [transfer, setTransfer] = useState(4);
  const [connError, setConnError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedByte | null>(null);

  useEffect(() => {
    const b = loadByte(number);
    setSaved(b);
    setByteStation(null);
  }, [number]);

  // Anslutningarna hämtas för stationen man tittar på, annars för det sparade bytet.
  const connStation = byteStation || saved?.station || null;
  const byteStop = journey?.stops.find((st) => st.name === connStation);
  const byteArrival = journey && byteStop ? arrivalAt(journey, byteStop) : '';

  // Anslutningarna hämtas om när tågets väntade ankomst ändras.
  useEffect(() => {
    if (!connStation || !byteArrival) {
      setConnections(null);
      return;
    }
    let active = true;
    setConnError(null);
    setConnections(null);
    fetch(
      `/api/trafik?action=connections&station=${encodeURIComponent(connStation)}&arrival=${encodeURIComponent(
        byteArrival
      )}&train=${encodeURIComponent(number)}`
    )
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) {
          setConnError(t(data.error || 'Kunde inte hämta anslutningarna.', 'Could not load connections.'));
          setConnections([]);
          return;
        }
        setTransfer(Number(data.transfer) || 4);
        setConnections(Array.isArray(data.departures) ? data.departures : []);
      })
      .catch(() => active && setConnError(t('Kunde inte hämta anslutningarna.', 'Could not load connections.')));
    return () => {
      active = false;
    };
  }, [connStation, byteArrival, number]);

  const savedConn =
    saved && connections
      ? connections.find((c) => c.line === saved.line && c.scheduledTime === saved.scheduledTime) || null
      : null;

  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
  }, [number]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setJourney(null);
    setError(null);
    function load() {
      fetch(`/api/trafik?action=train&number=${encodeURIComponent(number)}`)
        .then(async (res) => ({ ok: res.ok, data: await res.json() }))
        .then(({ ok, data }) => {
          if (!active) return;
          if (ok) setJourney(data);
          else
            setError(
              t(
                data.error || 'Kunde inte hämta tåget.',
                /^Hittade inget tåg/.test(data.error || '') ? `No train ${number} found today.` : 'Could not load the train.'
              )
            );
        })
        .catch(
          () =>
            active &&
            setError(t('Kunde inte hämta tåget. Kontrollera uppkopplingen.', 'Could not load the train. Check your connection.'))
        );
    }
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [number]);


  // Anslutningarna visas direkt under stationen man tryckte på.
  const connectionList = !connections ? null : (

            <div style={{ margin: '4px 0 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
                <span style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>
                    {t('Byte i', 'Change at')} {byteStation}
                  </h3>
                  <span style={{ fontSize: '0.8125rem', color: colors.textDim }}>
                    {t(
                      `ankomst ${byteArrival.slice(11)} · bytestid ${transfer} min`,
                      `arrival ${byteArrival.slice(11)} · transfer time ${transfer} min`
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setByteStation(null)}
                  style={{
                    flexShrink: 0,
                    minHeight: '40px',
                    padding: '0 12px',
                    borderRadius: 'var(--radius-control)',
                    border: `1px solid ${colors.borderStrong}`,
                    backgroundColor: colors.surface,
                    color: colors.text,
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t('Stäng', 'Close')}
                </button>
              </div>
              {connError ? <p style={{ color: colors.errorText, fontSize: '0.875rem' }}>{connError}</p> : null}
              {connections.length === 0 && !connError ? (
                <p style={{ color: colors.textDim, fontSize: '0.875rem' }}>
                  {t('Inga avgångar timmen efter ankomsten.', 'No departures in the hour after arrival.')}
                </p>
              ) : null}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
                {connections.map((c) => {
                  const v = verdict(c, transfer, lang);
                  const chosen = saved && saved.line === c.line && saved.scheduledTime === c.scheduledTime;
                  const color = v.tone === 'miss' ? colors.textDim : v.tone === 'tight' ? colors.amber : colors.text;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-pressed={Boolean(chosen)}
                        onClick={() => {
                          const b = { train: number, station: byteStation, line: c.line, destination: c.destination, scheduledTime: c.scheduledTime };
                          setSaved(b);
                          storeByte(b);
                          // Valt: listan fälls ihop, bytet står överst.
                          setByteStation(null);
                        }}
                        style={{
                          width: '100%',
                          minHeight: '48px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '0 12px',
                          borderRadius: 'var(--radius-control)',
                          border: `1px solid ${chosen ? colors.accentStrong : colors.border}`,
                          backgroundColor: chosen ? colors.surfaceRaised : colors.surface,
                          color: colors.text,
                          textAlign: 'left',
                          cursor: 'pointer',
                          opacity: v.tone === 'miss' ? 0.6 : 1,
                        }}
                      >
                        <span style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: '0.9375rem', width: '44px', flexShrink: 0 }}>
                          {c.newTime || c.scheduledTime}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                          <strong>{c.line}</strong> {t('mot', 'to')} {c.destination}
                        </span>
                        <span style={{ flexShrink: 0, fontSize: '0.8125rem', fontWeight: 700, color }}>{v.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          
  );

  const title = journey ? `${journey.product} ${journey.number}` : `${t('Tåg', 'Train')} ${number}`;

  return (
    <section
      ref={sheetRef}
      className="onboard-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="tagresa-rubrik"
      tabIndex={-1}
      style={{
        padding: '18px',
        borderRadius: '18px 18px 0 0',
        outline: 'none',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        boxShadow: `0 -8px 28px ${colors.shadow}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>
            {journey?.from && journey?.to ? `${journey.from} – ${journey.to}` : t('Tågets resa', "The train's journey")}
          </span>
          <h2 id="tagresa-rubrik" style={{ fontFamily: fonts.display, fontSize: '1.375rem', fontWeight: 800, margin: '2px 0 0' }}>
            {title}
          </h2>
          {journey?.operator ? <span style={{ fontSize: '0.8125rem', color: colors.textDim }}>{journey.operator}</span> : null}
          {onToggleSaved && journey ? (
            <button
              type="button"
              aria-pressed={trainSaved}
              onClick={onToggleSaved}
              style={{ ...stopAction(trainSaved), display: 'block', marginTop: '8px' }}
            >
              <span aria-hidden="true" style={{ color: trainSaved ? colors.onAccent : colors.brand, marginRight: '6px' }}>
                {trainSaved ? '★' : '☆'}
              </span>
              {trainSaved ? t('Sparat som mitt tåg', 'Saved as my train') : t('Spara som mitt tåg', 'Save as my train')}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            flexShrink: 0,
            minHeight: '44px',
            padding: '0 12px',
            borderRadius: 'var(--radius-control)',
            border: `1px solid ${colors.borderStrong}`,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: '0.8125rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('Stäng', 'Close')}
        </button>
      </div>

      {error ? (
        <p role="alert" style={{ margin: '14px 0 0', color: colors.errorText }}>
          {error}
        </p>
      ) : !journey ? (
        <p style={{ margin: '14px 0 0', color: colors.textDim }}>{t('Hämtar tåget…', 'Loading the train…')}</p>
      ) : (
        <>
          {journey.position ? (
            <p
              aria-live="polite"
              style={{
                margin: '12px 0',
                padding: '10px 12px',
                borderRadius: 'var(--radius-control)',
                backgroundColor: colors.surfaceRaised,
                fontWeight: 700,
                fontSize: '0.9375rem',
              }}
            >
              <span className="rt-dot" aria-hidden="true" style={{ display: 'inline-block', marginRight: '8px', verticalAlign: '1px' }} />
              {trainPosition(journey.position, lang)}
            </p>
          ) : null}
          {saved ? (
            <div
              aria-live="polite"
              style={{
                margin: '0 0 12px',
                padding: '12px 14px',
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${colors.borderStrong}`,
              }}
            >
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>
                {t('Ditt byte i', 'Your change at')} {saved.station}
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '2px' }}>
                {saved.line} {t('mot', 'to')} {saved.destination} {saved.scheduledTime}
              </div>
              <div style={{ fontSize: '0.875rem', marginTop: '2px' }}>
                {!connections ? (
                  <span style={{ color: colors.textDim }}>{t('Räknar…', 'Calculating…')}</span>
                ) : savedConn ? (
                  (() => {
                    const v = verdict(savedConn, transfer, lang);
                    const color = v.tone === 'miss' ? colors.cancelledText : v.tone === 'tight' ? colors.amber : colors.okText;
                    return (
                      <span style={{ color, fontWeight: 700 }}>
                        {v.text}
                        {savedConn.track ? <span style={{ color: colors.textDim, fontWeight: 500 }}> · {trackLabel(savedConn.track, lang)}</span> : null}
                        {v.tone === 'miss' ? <span style={{ color: colors.textDim, fontWeight: 500 }}> · {t('se nästa nedan', 'see the next one below')}</span> : null}
                      </span>
                    );
                  })()
                ) : (
                  <span style={{ color: colors.textDim }}>
                    {t('Bytet finns inte längre på tavlan.', 'The connection is no longer on the board.')}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSaved(null);
                  storeByte(null);
                }}
                style={{ marginTop: '6px', minHeight: '36px', padding: 0, border: 'none', background: 'none', color: colors.textDim, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                {t('Ta bort bytet', 'Remove the connection')}
              </button>
            </div>
          ) : null}

          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {journey.stops.map((st, i) => (
              <li
                key={st.signature}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '14px minmax(0, 1fr) auto',
                  gap: '10px',
                  alignItems: 'start',
                  padding: '8px 0',
                  borderTop: i === 0 ? 'none' : `1px solid ${colors.border}`,
                  opacity: st.passed ? 0.65 : 1,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    marginTop: '5px',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    border: `2px solid ${colors.text}`,
                    backgroundColor: st.passed ? colors.text : 'transparent',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ minWidth: 0 }}>
                  <button
                    type="button"
                    aria-expanded={openStop === st.name}
                    onClick={() => setOpenStop(openStop === st.name ? null : st.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      minHeight: '32px',
                      padding: 0,
                      border: 'none',
                      background: 'none',
                      color: colors.text,
                      fontWeight: 700,
                      fontSize: '0.9375rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      textDecoration: st.cancelled ? 'line-through' : 'none',
                    }}
                  >
                    {st.name}
                    <span aria-hidden="true" style={{ color: colors.textDim, fontWeight: 500 }}>
                      {openStop === st.name ? '▴' : '▾'}
                    </span>
                  </button>
                  <span style={{ display: 'block', fontSize: '0.8125rem', color: st.cancelled ? colors.cancelledText : colors.textDim }}>
                    {[
                      st.cancelled ? t('Inställd här', 'Cancelled here') : '',
                      st.track ? `${t('Spår', 'Track')} ${st.track}` : '',
                      ...(st.deviation || []),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span style={{ textAlign: 'right', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>
                  {timeCell(st.arrival, t('Ankomst', 'Arrival'))}
                  {timeCell(st.departure, t('Avgång', 'Departure'))}
                </span>
                {openStop === st.name ? (
                  <span style={{ gridColumn: '2 / -1', display: 'flex', flexWrap: 'wrap', gap: '8px', paddingBottom: '4px' }}>
                    {!st.passed && st.arrival && !st.cancelled ? (
                      <button
                        type="button"
                        aria-pressed={byteStation === st.name}
                        onClick={() => {
                          setByteStation(byteStation === st.name ? null : st.name);
                          setOpenStop(null);
                        }}
                        style={stopAction(byteStation === st.name)}
                      >
                        {byteStation === st.name ? `${t('Byte här', 'Change here')} ✓` : t('Byte här', 'Change here')}
                      </button>
                    ) : null}
                    {onOpenStation ? (
                      <button type="button" onClick={() => onOpenStation(st.name)} style={stopAction(false)}>
                        {t('Visa tavlan för', 'Show the board for')} {st.name}
                      </button>
                    ) : null}
                  </span>
                ) : null}
                {byteStation === st.name ? (
                  <div style={{ gridColumn: '1 / -1' }}>
                    {connections ? connectionList : <p style={{ margin: '4px 0 8px', fontSize: '0.875rem', color: colors.textDim }}>
                        {t('Hämtar anslutningar…', 'Loading connections…')}
                      </p>}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
          <p style={{ fontSize: '0.8125rem', color: colors.textDim, margin: '12px 0 0' }}>
            {t(
              'Tåginformation från Trafikverket. Överst ankomst, under avgång.',
              'Train information from Trafikverket. Arrival on top, departure below.'
            )}
          </p>
        </>
      )}
    </section>
  );
}
