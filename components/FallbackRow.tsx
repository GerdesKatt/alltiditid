import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import { colors } from './styles';
import { useLang } from '../lib/i18n';
import { loadStopIndex, stopPageFor } from '../lib/stopIndex';
import { inStockholm, uberLink, type NearbyBike, type Sparse } from '../lib/mobility.mjs';
import { track } from '../lib/track';

type Props = {
  stopId: string;
  stopName: string;
  /** Läget från tavlans svar; saknas det används hållplatslistan. */
  coords: { lat: number; lon: number } | null;
  /** Från sparseBoard(): visas bara när tavlan är gles. */
  sparse: NonNullable<Sparse>;
};

const linkButton = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '40px',
  padding: '0 12px',
  borderRadius: 'var(--radius-control)',
  border: `1px solid ${colors.borderStrong}`,
  backgroundColor: colors.surface,
  color: colors.text,
  fontSize: 'var(--fs-2)',
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
} as const;

const line = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '12px 0',
} as const;

/**
 * "Annat sätt härifrån": en lugn rad under tavlan när nästa avgång dröjer.
 * Taxi via Uber (hållplatsen som upphämtning) och, där det finns öppna data,
 * närmaste lånecykel per system. Ingen färg: det här är inte en avvikelse.
 */
export default function FallbackRow({ stopId, stopName, coords, sparse }: Props) {
  const { t } = useLang();
  const [stop, setStop] = useState<{ lat: number; lon: number } | null>(null);
  const [bikes, setBikes] = useState<NearbyBike[]>([]);

  useEffect(() => {
    let alive = true;
    if (coords) {
      setStop((prev) => (prev && prev.lat === coords.lat && prev.lon === coords.lon ? prev : coords));
      return;
    }
    setStop(null);
    loadStopIndex().then((index) => {
      const page = stopPageFor(index, stopId);
      if (alive && page && Number.isFinite(page.lat) && Number.isFinite(page.lon)) setStop({ lat: page.lat, lon: page.lon });
    });
    return () => {
      alive = false;
    };
  }, [stopId, coords?.lat, coords?.lon]);

  useEffect(() => {
    setBikes([]);
    if (!stop) return;
    let alive = true;
    const qs = `action=mobility&lat=${stop.lat.toFixed(4)}&lon=${stop.lon.toFixed(4)}`;
    fetch(`/api/trafik?${qs}`)
      .then((res) => (res.ok ? res.json() : { bikes: [] }))
      .then((body) => {
        if (alive && Array.isArray(body?.bikes)) setBikes(body.bikes.slice(0, 3));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [stop]);

  // Utan koordinater kan vi inte ge någon upphämtningsplats; då hellre ingen rad.
  if (!stop) return null;

  // Minuterna står redan på tavlan; raden säger bara varför den syns och vad man kan göra.
  // På natten säger rutan ovanför redan att avgångarna är slut; här står bara vad man kan göra (N9).
  const heading =
    sparse.kind === 'wait'
      ? t('Lång väntan? Ta en taxi.', 'Long wait? Take a taxi.')
      : t('Ta en taxi i stället.', 'Take a taxi instead.');
  const sub =
    sparse.kind === 'wait'
      ? t(`Hämtas vid ${stopName}.`, `Pick-up at ${stopName}.`)
      : t(`Hämtas vid ${stopName}.`, `Pick-up at ${stopName}.`);

  return (
    <aside
      aria-label={t('Annat sätt härifrån', 'Another way from here')}
      style={{ marginTop: '14px', borderTop: `1px solid ${colors.text}`, borderBottom: `1px solid ${colors.border}` }}
    >
      <div style={{ ...line, flexWrap: 'wrap' }}>
        <span style={{ paddingTop: '2px', color: colors.textDim }}>
          <Icon name="car" size={18} />
        </span>
        <div style={{ flex: '1 1 12rem', minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 'var(--fs-3)' }}>{heading}</strong>
          <span style={{ fontSize: 'var(--fs-2)', color: colors.textDim }}>
            {sub}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginLeft: '28px' }}>
          <a
            href={uberLink(stop.lat, stop.lon, stopName)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('funktion', 0, 'uber')}
            style={linkButton}
          >
            Uber ↗
          </a>
          {inStockholm(stop.lat, stop.lon) ? (
            <a href="tel:+46815000" onClick={() => track('funktion', 0, 'taxi_sthlm')} style={linkButton}>
              {t('Ring Taxi Stockholm', 'Call Taxi Stockholm')}
            </a>
          ) : null}
        </div>
      </div>
      {bikes.map((b) => (
        <a
          key={b.system}
          href={b.app}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('funktion', 0, 'cykel')}
          style={{ ...line, borderTop: `1px solid ${colors.border}`, color: colors.text, textDecoration: 'none' }}
        >
          <span style={{ paddingTop: '2px', color: colors.textDim }}>
            <Icon name="bike" size={18} />
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: 'var(--fs-3)' }}>
              {b.name}, {b.meters} m
            </strong>
            <span style={{ fontSize: 'var(--fs-2)', color: colors.textDim }}>
              {b.station} · {b.bikes === 1 ? t('1 cykel ledig', '1 bike free') : t(`${b.bikes} cyklar lediga`, `${b.bikes} bikes free`)}
            </span>
          </span>
          <span aria-hidden="true" style={{ alignSelf: 'center', color: colors.textDim }}>↗</span>
        </a>
      ))}
      {bikes.length ? (
        // Källan ska stå med (Lundahojs licens kräver det, och det är schysst mot övriga).
        <p style={{ margin: 0, padding: '0 0 10px 28px', fontSize: 'var(--fs-1)', color: colors.textFaint }}>
          {t('Öppna data från', 'Open data from')} {Array.from(new Set(bikes.map((b) => b.name))).join(', ')}.
        </p>
      ) : null}
    </aside>
  );
}
