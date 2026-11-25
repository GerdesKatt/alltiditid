import React, { useEffect, useState } from 'react';
import type { StopOption } from '../lib/types';
import { colors } from './styles';

type NearbyStop = StopOption & { distance: number };

type Status =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'loading' }
  | { kind: 'done'; stops: NearbyStop[] }
  | { kind: 'error'; message: string };

type Props = {
  onSelect: (stop: StopOption) => void;
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Ungefärlig gångtid med 80 m/min (knappt 5 km/h). */
function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}

function geolocationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Platsåtkomst är avstängd. Tillåt plats för alltiditid.se i webbläsarens inställningar, eller sök hållplats nedan.';
    case error.TIMEOUT:
      return 'Det tog för lång tid att hitta din position. Försök igen, eller sök hållplats nedan.';
    default:
      return 'Din position gick inte att hitta just nu. Försök igen, eller sök hållplats nedan.';
  }
}

/**
 * "Hållplatser nära mig": frågar efter position först när knappen trycks,
 * skickar en avrundad position (cirka 100 m) till API:et och visar de närmaste
 * hållplatserna med avstånd och ungefärlig gångtid.
 */
export default function NearbyStops({ onSelect }: Props) {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // navigator finns bara i webbläsaren; kontrollera efter att sidan laddats.
  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && 'geolocation' in navigator);
  }, []);

  if (!supported) return null;

  function locate() {
    setStatus({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus({ kind: 'loading' });
        const lat = pos.coords.latitude.toFixed(3);
        const lon = pos.coords.longitude.toFixed(3);
        fetch(`/api/trafik?action=nearby&lat=${lat}&lon=${lon}`)
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Kunde inte hämta hållplatser.');
            return data;
          })
          .then((data) => {
            const stops: NearbyStop[] = Array.isArray(data.stops) ? data.stops : [];
            setStatus(
              stops.length > 0
                ? { kind: 'done', stops }
                : { kind: 'error', message: 'Inga hållplatser hittades inom 1,5 km.' }
            );
          })
          .catch((err) => {
            setStatus({
              kind: 'error',
              message: err.message || 'Kunde inte hämta hållplatser just nu.',
            });
          });
      },
      (error) => setStatus({ kind: 'error', message: geolocationMessage(error) }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  const busy = status.kind === 'locating' || status.kind === 'loading';

  return (
    <div style={{ marginBottom: '12px' }}>
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        style={{
          minHeight: '44px',
          padding: '0 16px',
          borderRadius: '10px',
          border: `1px solid ${colors.accent}`,
          backgroundColor: busy ? colors.surface : 'rgba(56, 189, 248, 0.12)',
          color: colors.text,
          fontWeight: 700,
          fontSize: '14px',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        <span aria-hidden="true">📍 </span>
        {status.kind === 'locating'
          ? 'Hittar din position…'
          : status.kind === 'loading'
          ? 'Söker hållplatser…'
          : status.kind === 'done'
          ? 'Uppdatera närmaste hållplatser'
          : 'Hållplatser nära mig'}
      </button>

      <div aria-live="polite">
        {status.kind === 'error' ? (
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: colors.amber, lineHeight: 1.45 }}>
            {status.message}
          </p>
        ) : null}

        {status.kind === 'done' ? (
          <ul
            aria-label="Närmaste hållplatser"
            style={{ listStyle: 'none', margin: '8px 0 0 0', padding: 0, display: 'grid', gap: '6px' }}
          >
            {status.stops.map((stop) => (
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
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: `1px solid ${colors.borderStrong}`,
                    backgroundColor: colors.surface,
                    color: colors.text,
                    fontSize: '14px',
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>{stop.name}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textDim, whiteSpace: 'nowrap' }}>
                    {formatDistance(stop.distance)} · ca {walkingMinutes(stop.distance)} min gång
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
