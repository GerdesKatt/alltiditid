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
  product: string;
  operator?: string;
  from?: string;
  to?: string;
  position?: string;
  stops: Stop[];
  updatedAt?: string;
};

const REFRESH_MS = 60_000;

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
