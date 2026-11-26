import React, { useEffect, useState } from 'react';
import type { MyTrain } from '../lib/myTrain';
import { colors, fonts } from './styles';

type Stop = { name: string; arrival?: { scheduled: string; estimated?: string; actual?: string; delay: number }; passed?: boolean };
type Journey = { number: string; product: string; to?: string; position?: string; stops: Stop[] };
type Byte = { train: string; station: string; line: string; destination: string; scheduledTime: string };

/** Mitt tåg överst på startsidan: läge, ankomst till slutstationen och sparat byte. */
export default function MyTrainCard({
  train,
  onOpen,
  onRemove,
}: {
  train: MyTrain;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [byte, setByte] = useState<Byte | null>(null);

  useEffect(() => {
    let active = true;
    function load() {
      fetch(`/api/trafik?action=train&number=${encodeURIComponent(train.number)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => active && data && setJourney(data))
        .catch(() => {});
      try {
        const b = JSON.parse(window.localStorage.getItem('alltiditid:byte') || 'null');
        if (active) setByte(b && b.train === train.number ? b : null);
      } catch {
        // Ingen lagring.
      }
    }
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 60_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [train.number]);

  const last = journey?.stops[journey.stops.length - 1];
  const target = byte ? journey?.stops.find((s) => s.name === byte.station) || last : last;
  const arr = target?.arrival;
  const shown = arr?.actual || arr?.estimated;

  return (
    <section
      aria-label={`Mitt tåg ${train.number}`}
      style={{
        marginBottom: '14px',
        padding: '14px',
        borderRadius: 'var(--radius-card)',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-10px' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>Mitt tåg</span>
        <button
          type="button"
          onClick={onRemove}
          style={{ minHeight: '44px', padding: '0 4px 0 12px', marginRight: '-4px', border: 'none', background: 'none', color: colors.textDim, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
        >
          Ta bort<span className="sr-only"> mitt tåg</span>
        </button>
      </div>
      <button
        type="button"
        onClick={onOpen}
        style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', color: colors.text, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
      >
        <span style={{ display: 'block', fontFamily: fonts.display, fontSize: '1.125rem', fontWeight: 800 }}>
          {journey ? `${journey.product} ${journey.number}` : `Tåg ${train.number}`}
          {journey?.to ? <span style={{ fontWeight: 600, color: colors.textDim }}> mot {journey.to}</span> : null}
        </span>
        {journey?.position ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '0.9375rem', fontWeight: 600 }}>
            <span className="rt-dot" aria-hidden="true" />
            {journey.position}
          </span>
        ) : (
          <span style={{ display: 'block', marginTop: '6px', color: colors.textDim }}>{journey ? '' : 'Hämtar tåget…'}</span>
        )}
        {target && arr ? (
          <span style={{ display: 'block', marginTop: '6px', fontSize: '0.9375rem' }}>
            Framme i {target.name}{' '}
            <strong style={{ fontFamily: fonts.display }}>{arr.scheduled}</strong>
            {shown && shown !== arr.scheduled ? (
              <strong style={{ color: colors.amber }}> → {shown}</strong>
            ) : null}
          </span>
        ) : null}
        {byte ? (
          <span style={{ display: 'block', marginTop: '4px', fontSize: '0.875rem', color: colors.textDim }}>
            Byte till {byte.line} mot {byte.destination} {byte.scheduledTime} · tryck för att se om du hinner
          </span>
        ) : null}
      </button>
    </section>
  );
}
