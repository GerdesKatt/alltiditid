import React, { useEffect, useState } from 'react';
import type { Departure, StopOption, TransportMode } from '../lib/types';
import Icon from './Icon';
import { colors, fonts } from './styles';
import { lineLabel, useLang } from '../lib/i18n';
import { lineBadge } from '../lib/lineFormat';
import { FIND_WINDOWS, localMinute, tripCandidates, type FindKind, type TripCandidate } from '../lib/findTrip.mjs';

type Props = {
  stop: StopOption;
  mode: TransportMode;
  onShowTrain: (trainNumber: string) => void;
  onShowTrip: (trip: { id: string; date: string }) => void;
};

type Status =
  | { kind: 'closed' }
  | { kind: 'loading'; source: FindKind }
  | { kind: 'done'; source: FindKind; stopName: string; list: TripCandidate[] }
  | { kind: 'error'; message: string };

const pill = {
  minHeight: '44px',
  padding: '0 14px',
  borderRadius: 'var(--radius-control)',
  border: `1px solid ${colors.borderStrong}`,
  backgroundColor: colors.surface,
  color: colors.text,
  fontFamily: 'inherit',
  fontSize: 'var(--fs-2)',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

async function fetchBoard(stop: StopOption, from: number): Promise<Departure[]> {
  const res = await fetch(
    `/api/trafik?action=departures&stopId=${encodeURIComponent(stop.id)}&stopName=${encodeURIComponent(
      stop.name
    )}&mode=all&direction=departures&time=${encodeURIComponent(localMinute(from))}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Kunde inte hämta avgångarna.');
  return Array.isArray(data.departures) ? data.departures : [];
}

/**
 * "Sitter du redan på?": hittar turen du åker med, så att du kan öppna hela resan och se
 * bytet. Matchar på hållplats och tid: den hållplats du klev på (tavlans), eller den som
 * är närmast dig just nu. Positionen avrundas och används bara för att hitta hållplatsen.
 */
export default function FindTrip({ stop, mode, onShowTrain, onShowTrip }: Props) {
  const { lang, t } = useLang();
  const [status, setStatus] = useState<Status>({ kind: 'closed' });
  // Byter man trafikslag eller hållplats fälls listan ihop, så att tavlan kommer upp igen.
  useEffect(() => {
    setStatus({ kind: 'closed' });
  }, [mode, stop.id]);

  async function search(source: FindKind, at: StopOption) {
    setStatus({ kind: 'loading', source });
    try {
      const now = Date.now();
      const list = await fetchBoard(at, now + FIND_WINDOWS[source][0] * 60000);
      setStatus({ kind: 'done', source, stopName: at.name, list: tripCandidates(list, Date.now(), source, mode) });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: t((err as Error).message || 'Kunde inte hämta avgångarna.', 'Could not load departures.'),
      });
    }
  }

  function nearMe() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus({ kind: 'error', message: t('Webbläsaren kan inte ge din position.', 'Your browser cannot give your location.') });
      return;
    }
    setStatus({ kind: 'loading', source: 'near' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Samma avrundning (cirka 100 m) och samma anrop som "Hållplatser nära mig".
        fetch('/api/trafik?action=nearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: Number(pos.coords.latitude.toFixed(3)),
            lon: Number(pos.coords.longitude.toFixed(3)),
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            const nearest: StopOption | undefined = Array.isArray(data.stops) ? data.stops[0] : undefined;
            if (!nearest) throw new Error(t('Hittade ingen hållplats nära dig.', 'No stop found near you.'));
            return search('near', nearest);
          })
          .catch((err) => setStatus({ kind: 'error', message: err.message }));
      },
      () =>
        setStatus({
          kind: 'error',
          message: t(
            'Din position gick inte att hitta. Under jord är den ofta svag; välj hållplatsen du klev på i stället.',
            'Your location could not be found. Underground it is often weak; use the stop where you got on instead.'
          ),
        }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30_000 }
    );
  }

  if (status.kind === 'closed') {
    return (
      <button
        type="button"
        onClick={() => search('boarded', stop)}
        title={t('Sitter du redan på? Hitta turen du åker med', 'Already on board? Find the trip you are on')}
        style={{
          minHeight: '44px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '0 4px',
          border: 'none',
          backgroundColor: 'transparent',
          color: colors.accent,
          fontFamily: 'inherit',
          fontWeight: 700,
          fontSize: 'var(--fs-2)',
          cursor: 'pointer',
        }}
      >
        <Icon name="train" />
        {t('Hitta min tur', 'Find my trip')}
      </button>
    );
  }

  const heading =
    status.kind === 'done'
      ? status.source === 'near'
        ? t(`Passerar ${status.stopName} ungefär nu`, `Passing ${status.stopName} about now`)
        : t(`Har gått från ${status.stopName} nyss`, `Recently left ${status.stopName}`)
      : t('Vilken tur sitter du på?', 'Which trip are you on?');

  return (
    <div
      style={{
        flexBasis: '100%',
        boxSizing: 'border-box',
        marginBottom: '12px',
        padding: '12px',
        borderRadius: 'var(--radius-card)',
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
        fontSize: 'var(--fs-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
        <h2 style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-3)', fontWeight: 800, margin: 0 }}>
          <Icon name="train" /> 
          {heading}
        </h2>
        <button
          type="button"
          onClick={() => setStatus({ kind: 'closed' })}
          style={{ ...pill, minHeight: '36px', border: 'none', backgroundColor: 'transparent', color: colors.textDim }}
        >
          {t('Stäng', 'Close')}
        </button>
      </div>

      <div role="status">
        {status.kind === 'loading' ? (
          <p style={{ margin: '0 0 8px', color: colors.textDim }}>
            {status.source === 'near' ? t('Letar efter turer nära dig…', 'Looking for trips near you…') : t('Hämtar…', 'Loading…')}
          </p>
        ) : status.kind === 'error' ? (
          <p style={{ margin: '0 0 8px', color: colors.textDim }}>{status.message}</p>
        ) : status.kind === 'done' && status.list.length === 0 ? (
          <p style={{ margin: '0 0 8px', color: colors.textDim }}>
            {t('Hittade ingen tur som passar. Prova den andra knappen nedan.', 'No matching trip found. Try the other button below.')}
          </p>
        ) : null}
      </div>

      {status.kind === 'done' && status.list.length > 0 ? (
        <>
          <p style={{ margin: '0 0 8px', color: colors.textDim }}>
            {t('Tryck på din tur för att se hela resan och välja byte.', 'Tap your trip to see the whole journey and pick a change.')}
          </p>
          <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'grid', gap: '6px' }}>
            {status.list.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() =>
                    d.tripId && d.tripDate && !(d.trainNumber && (d.transportMode === 'train' || d.transportMode === 'commuter'))
                      ? onShowTrip({ id: d.tripId, date: d.tripDate })
                      : onShowTrain(d.trainNumber!)
                  }
                  style={{
                    ...pill,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'left',
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      minWidth: '40px',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-badge)',
                      border: `1.5px solid ${colors.badgeBorder}`,
                      backgroundColor: colors.badgeBg,
                      color: colors.badgeText,
                      fontFamily: fonts.display,
                      fontWeight: 800,
                      textAlign: 'center',
                    }}
                  >
                    {lineLabel(lineBadge(d.line), lang)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t('mot', 'to')} {d.destination}
                    <span style={{ display: 'block', fontSize: 'var(--fs-2)', color: colors.textDim, fontWeight: 400 }}>
                      {d.minutesAgo > 0
                        ? t(`gick ${d.estimatedTime || d.scheduledTime}, för ${d.minutesAgo} min sedan`, `left ${d.estimatedTime || d.scheduledTime}, ${d.minutesAgo} min ago`)
                        : d.minutesAgo === 0
                        ? t(`går ${d.estimatedTime || d.scheduledTime}, nu`, `leaves ${d.estimatedTime || d.scheduledTime}, now`)
                        : t(`går ${d.estimatedTime || d.scheduledTime}, om ${-d.minutesAgo} min`, `leaves ${d.estimatedTime || d.scheduledTime}, in ${-d.minutesAgo} min`)}
                    </span>
                  </span>
                  <span aria-hidden="true" style={{ color: colors.textDim }}>›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {status.kind !== 'loading' && !(status.kind === 'done' && status.source === 'near') ? (
          <button type="button" onClick={nearMe} style={pill}>
            📍 {t('Hitta via min position', 'Find by my location')}
          </button>
        ) : null}
        {status.kind !== 'loading' && !(status.kind === 'done' && status.source === 'boarded') ? (
          <button type="button" onClick={() => search('boarded', stop)} style={pill}>
            {t(`Jag klev på vid ${stop.name}`, `I got on at ${stop.name}`)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
