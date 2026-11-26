import React, { useEffect, useState } from 'react';
import type { StopOption } from '../lib/types';
import { colors } from './styles';
import { StopRow } from './Home';
import { decimal, translator, useLang, type Lang } from '../lib/i18n';

type NearbyStop = StopOption & { distance: number };

type Status =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'loading' }
  | { kind: 'done'; stops: NearbyStop[] }
  | { kind: 'error'; message: string };

type Props = {
  onSelect: (stop: StopOption) => void;
  /** Visas på samma rad som knappen, till höger (t.ex. regionväljaren). */
  trailing?: React.ReactNode;
};

function formatDistance(meters: number, lang: Lang): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${decimal(meters / 1000, 1, lang)} km`;
}

/** Ungefärlig gångtid med 80 m/min (knappt 5 km/h). */
function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}

function geolocationMessage(error: GeolocationPositionError, lang: Lang): string {
  const t = translator(lang);
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return t(
        'Platsåtkomst är avstängd. Tillåt plats för alltiditid.se i webbläsarens inställningar, eller sök hållplats nedan.',
        'Location access is off. Allow location for alltiditid.se in your browser settings, or search for a stop.'
      );
    case error.TIMEOUT:
      return t(
        'Det tog för lång tid att hitta din position. Försök igen, eller sök hållplats nedan.',
        'Finding your location took too long. Try again, or search for a stop.'
      );
    default:
      return t(
        'Din position gick inte att hitta just nu. Försök igen, eller sök hållplats nedan.',
        'Your location could not be found right now. Try again, or search for a stop.'
      );
  }
}

/**
 * "Hållplatser nära mig": frågar efter position först när knappen trycks,
 * skickar en avrundad position (cirka 100 m) till API:et och visar de närmaste
 * hållplatserna med avstånd och ungefärlig gångtid.
 */
export default function NearbyStops({ onSelect, trailing }: Props) {
  // Klockan för nedräkningen i raderna; uppdateras var 30:e sekund.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const { lang, t } = useLang();

  // navigator finns bara i webbläsaren; kontrollera efter att sidan laddats.
  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && 'geolocation' in navigator);
  }, []);


  function locate() {
    setStatus({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus({ kind: 'loading' });
        const lat = pos.coords.latitude.toFixed(3);
        const lon = pos.coords.longitude.toFixed(3);
        // POST så att positionen inte hamnar i adressen (och därmed inte i loggar).
        fetch('/api/trafik?action=nearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: Number(lat), lon: Number(lon) }),
        })
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok) throw new Error(t(data.error || 'Kunde inte hämta hållplatser.', 'Could not load stops.'));
            return data;
          })
          .then((data) => {
            const stops: NearbyStop[] = Array.isArray(data.stops) ? data.stops : [];
            setStatus(
              stops.length > 0
                ? { kind: 'done', stops }
                : { kind: 'error', message: t('Inga hållplatser hittades inom 1,5 km.', 'No stops found within 1.5 km.') }
            );
          })
          .catch((err) => {
            setStatus({
              kind: 'error',
              message: err.message || t('Kunde inte hämta hållplatser just nu.', 'Could not load stops right now.'),
            });
          });
      },
      (error) => setStatus({ kind: 'error', message: geolocationMessage(error, lang) }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  const busy = status.kind === 'locating' || status.kind === 'loading';

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px' }}>
      {supported ? (
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        aria-label={status.kind === 'idle' ? t('Hållplatser nära mig', 'Stops near me') : undefined}
        style={{
          minHeight: '44px',
          display: 'inline-flex',
          textAlign: 'left',
          alignItems: 'center',
          gap: '6px',
          padding: '0 12px 0 10px',
          borderRadius: 'var(--radius-control)',
          border: 'none',
          backgroundColor: 'transparent',
          color: colors.accent,
          fontFamily: 'inherit',
          fontWeight: 700,
          fontSize: '0.875rem',
          cursor: busy ? 'default' : 'pointer',
          marginLeft: '-10px',
        }}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        {status.kind === 'locating'
          ? t('Hittar din position…', 'Finding your location…')
          : status.kind === 'loading'
          ? t('Söker hållplatser…', 'Searching for stops…')
          : status.kind === 'done'
          ? t('Uppdatera nära mig', 'Refresh near me')
          : t('Nära mig', 'Near me')}
      </button>
      ) : null}
      {trailing}
      </div>

      <div aria-live="polite">
        {status.kind === 'error' ? (
          <p style={{ margin: '8px 0 0 0', fontSize: '0.8125rem', color: colors.amber, lineHeight: 1.45 }}>
            {status.message}
          </p>
        ) : null}

        {status.kind === 'done' ? (
          <ul
            aria-label={t('Närmaste hållplatser', 'Nearest stops')}
            style={{ listStyle: 'none', margin: '8px 0 0 0', padding: 0, borderTop: `1px solid ${colors.text}` }}
          >
            {status.stops.slice(0, 4).map((stop) => (
              // Linje och riktning per hållplats: två hållplatser 50 m isär skiljs åt av vart de går.
              <StopRow key={stop.id} stop={{ id: stop.id, name: stop.name }} now={now} distance={stop.distance} onOpen={() => onSelect({ id: stop.id, name: stop.name })} />
            ))}
            {status.stops.slice(4).map((stop) => (
              <li key={stop.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ id: stop.id, name: stop.name })}
                  style={{
                    width: '100%',
                    minHeight: '48px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 0',
                    border: 'none',
                    borderBottom: `1px solid ${colors.border}`,
                    backgroundColor: 'transparent',
                    color: colors.text,
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>{stop.name}</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim, whiteSpace: 'nowrap' }}>
                    {formatDistance(stop.distance, lang)} ·{' '}
                    {t(
                      `ca ${walkingMinutes(stop.distance)} min gång`,
                      `about ${walkingMinutes(stop.distance)} min walk`
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
