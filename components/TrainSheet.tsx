import React, { useEffect, useRef, useState } from 'react';
import { colors, fonts } from './styles';

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
const BYTE_KEY = 'alltiditid:byte';

type Connection = {
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
type SavedByte = { train: string; station: string; line: string; destination: string; scheduledTime: string };

function loadByte(train: string): SavedByte | null {
  try {
    const b = JSON.parse(window.localStorage.getItem(BYTE_KEY) || 'null');
    return b && b.train === train ? b : null;
  } catch {
    return null;
  }
}
function storeByte(b: SavedByte | null) {
  try {
    if (b) window.localStorage.setItem(BYTE_KEY, JSON.stringify(b));
    else window.localStorage.removeItem(BYTE_KEY);
  } catch {
    // Valet gäller tills sidan laddas om.
  }
}

/** Väntad ankomst som 'YYYY-MM-DDTHH:MM'. Tider före första avgången hör till nästa dag. */
function arrivalAt(journey: Journey, stop: Stop): string {
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

function verdict(c: Connection, transfer: number): { text: string; tone: 'ok' | 'tight' | 'miss' } {
  if (c.status === 'cancelled') return { text: 'Inställd', tone: 'miss' };
  if (c.margin === null) return { text: '', tone: 'ok' };
  if (c.margin < 0) return { text: 'Missar', tone: 'miss' };
  if (c.margin <= 1) return { text: 'Hinner troligen inte', tone: 'miss' };
  if (c.margin < transfer) return { text: `Tight · ${c.margin} min`, tone: 'tight' };
  return { text: `Hinner · ${c.margin} min`, tone: 'ok' };
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
export default function TrainSheet({ number, onClose }: { number: string; onClose: () => void }) {
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
    setByteStation(b ? b.station : null);
  }, [number]);

  const byteStop = journey?.stops.find((st) => st.name === byteStation);
  const byteArrival = journey && byteStop ? arrivalAt(journey, byteStop) : '';

  // Anslutningarna hämtas om när tågets väntade ankomst ändras.
  useEffect(() => {
    if (!byteStation || !byteArrival) {
      setConnections(null);
      return;
    }
    let active = true;
    setConnError(null);
    fetch(
      `/api/trafik?action=connections&station=${encodeURIComponent(byteStation)}&arrival=${encodeURIComponent(
        byteArrival
      )}&train=${encodeURIComponent(number)}`
    )
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) {
          setConnError(data.error || 'Kunde inte hämta anslutningarna.');
          setConnections([]);
          return;
        }
        setTransfer(Number(data.transfer) || 4);
        setConnections(Array.isArray(data.departures) ? data.departures : []);
      })
      .catch(() => active && setConnError('Kunde inte hämta anslutningarna.'));
    return () => {
      active = false;
    };
  }, [byteStation, byteArrival, number]);

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
          else setError(data.error || 'Kunde inte hämta tåget.');
        })
        .catch(() => active && setError('Kunde inte hämta tåget. Kontrollera uppkopplingen.'));
    }
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [number]);

  const title = journey ? `${journey.product} ${journey.number}` : `Tåg ${number}`;

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
          <span style={{ fontSize: '13px', fontWeight: 600, color: colors.textDim }}>
            {journey?.from && journey?.to ? `${journey.from} – ${journey.to}` : 'Tågets resa'}
          </span>
          <h2 id="tagresa-rubrik" style={{ fontFamily: fonts.display, fontSize: '22px', fontWeight: 800, margin: '2px 0 0' }}>
            {title}
          </h2>
          {journey?.operator ? <span style={{ fontSize: '13px', color: colors.textDim }}>{journey.operator}</span> : null}
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
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Stäng
        </button>
      </div>

      {error ? (
        <p role="alert" style={{ margin: '14px 0 0', color: colors.errorText }}>
          {error}
        </p>
      ) : !journey ? (
        <p style={{ margin: '14px 0 0', color: colors.textDim }}>Hämtar tåget…</p>
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
                fontSize: '15px',
              }}
            >
              <span className="rt-dot" aria-hidden="true" style={{ display: 'inline-block', marginRight: '8px', verticalAlign: '1px' }} />
              {journey.position}
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
              <div style={{ fontSize: '13px', fontWeight: 600, color: colors.textDim }}>Ditt byte i {saved.station}</div>
              <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>
                {saved.line} mot {saved.destination} {saved.scheduledTime}
              </div>
              <div style={{ fontSize: '14px', marginTop: '2px' }}>
                {!connections ? (
                  <span style={{ color: colors.textDim }}>Räknar…</span>
                ) : savedConn ? (
                  (() => {
                    const v = verdict(savedConn, transfer);
                    const color = v.tone === 'miss' ? colors.cancelledText : v.tone === 'tight' ? colors.amber : colors.okText;
                    return (
                      <span style={{ color, fontWeight: 700 }}>
                        {v.text}
                        {savedConn.track ? <span style={{ color: colors.textDim, fontWeight: 500 }}> · {savedConn.track}</span> : null}
                        {v.tone === 'miss' ? <span style={{ color: colors.textDim, fontWeight: 500 }}> · se nästa nedan</span> : null}
                      </span>
                    );
                  })()
                ) : (
                  <span style={{ color: colors.textDim }}>Bytet finns inte längre på tavlan.</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSaved(null);
                  storeByte(null);
                }}
                style={{ marginTop: '6px', minHeight: '36px', padding: 0, border: 'none', background: 'none', color: colors.textDim, fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Ta bort bytet
              </button>
            </div>
          ) : null}

          {byteStation && connections ? (
            <div style={{ margin: '0 0 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Byte i {byteStation}</h3>
                <span style={{ fontSize: '12px', color: colors.textDim }}>
                  ankomst {byteArrival.slice(11)} · bytestid {transfer} min
                </span>
              </div>
              {connError ? <p style={{ color: colors.errorText, fontSize: '14px' }}>{connError}</p> : null}
              {connections.length === 0 && !connError ? (
                <p style={{ color: colors.textDim, fontSize: '14px' }}>Inga avgångar timmen efter ankomsten.</p>
              ) : null}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
                {connections.map((c) => {
                  const v = verdict(c, transfer);
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
                        <span style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: '15px', width: '44px', flexShrink: 0 }}>
                          {c.newTime || c.scheduledTime}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px' }}>
                          <strong>{c.line}</strong> mot {c.destination}
                        </span>
                        <span style={{ flexShrink: 0, fontSize: '13px', fontWeight: 700, color }}>{v.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
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
                  <span
                    style={{
                      display: 'block',
                      fontWeight: 700,
                      fontSize: '15px',
                      textDecoration: st.cancelled ? 'line-through' : 'none',
                    }}
                  >
                    {st.name}
                  </span>
                  <span style={{ display: 'block', fontSize: '13px', color: st.cancelled ? colors.cancelledText : colors.textDim }}>
                    {[st.cancelled ? 'Inställd här' : '', st.track ? `Spår ${st.track}` : '', ...(st.deviation || [])]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span style={{ textAlign: 'right', fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>
                  {timeCell(st.arrival, 'Ankomst')}
                  {timeCell(st.departure, 'Avgång')}
                  {!st.passed && st.arrival && !st.cancelled ? (
                    <button
                      type="button"
                      aria-pressed={byteStation === st.name}
                      onClick={() => {
                        setByteStation(byteStation === st.name ? null : st.name);
                        // Anslutningarna visas överst i bladet.
                        sheetRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      style={{
                        marginTop: '4px',
                        minHeight: '32px',
                        padding: '0 10px',
                        borderRadius: 'var(--radius-control)',
                        border: `1px solid ${byteStation === st.name ? colors.accentStrong : colors.borderStrong}`,
                        backgroundColor: byteStation === st.name ? colors.accentStrong : colors.surface,
                        color: byteStation === st.name ? colors.onAccent : colors.text,
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Byte här
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          <p style={{ fontSize: '12px', color: colors.textDim, margin: '12px 0 0' }}>
            Tåginformation från Trafikverket. Överst ankomst, under avgång.
          </p>
        </>
      )}
    </section>
  );
}
