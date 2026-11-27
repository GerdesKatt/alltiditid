'use client';
import React, { useEffect, useState } from 'react';
import type { Departure, StopOption } from '../lib/types';
import { colors, fonts } from './styles';
import { lineLabel, useLang } from '../lib/i18n';
import { countdownFor, groupKey, lineBadge, lineColor, parseLocal } from '../lib/lineFormat';
import { boardUrl } from '../lib/prefetch';
import { positionAllowed, rememberPositionAllowed } from '../lib/visits';
import InstallApp from './InstallApp';
import SmartSearch from './SmartSearch';

type Nearby = StopOption & { distance: number; modes?: string[] };

type Props = {
  /** Dina hållplatser (vanligaste + stjärnmärkta), högst tre. */
  stops: StopOption[];
  now: number;
  onOpenStop: (stop: StopOption) => void;
  onOpenTrain: (number: string) => void;
  onOpenAirport: (iata: string) => void;
  /** Vart ska du? från Hem: öppnar Min resa och söker resan. */
  onGoal: (text: string) => void;
};

const label: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: colors.textDim,
};

/**
 * Hem: dit Nu alltid leder. Dina hållplatser med nästa avgångar, det som är nära dig,
 * och sök. Positionen sorterar dina hållplatser (närmast först) och visar andra nära dig;
 * den frågas om först när man trycker, och sparas aldrig.
 */
export default function Home({ stops, now, onOpenStop, onOpenTrain, onOpenAirport, onGoal }: Props) {
  const { t } = useLang();
  const [nearby, setNearby] = useState<Nearby[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [posError, setPosError] = useState('');
  // Linjer och riktningar som redan syns under Dina hållplatser: visas inte igen under Nära dig.
  const [covered, setCovered] = useState<Record<string, string[]>>({});

  function locate() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPosError(t('Webbläsaren kan inte ge din position.', 'Your browser cannot give your location.'));
      return;
    }
    setLocating(true);
    setPosError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        rememberPositionAllowed(true);
        fetch('/api/trafik?action=nearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: Number(pos.coords.latitude.toFixed(3)), lon: Number(pos.coords.longitude.toFixed(3)), wide: true }),
        })
          .then((res) => res.json())
          .then((data) => setNearby(Array.isArray(data.stops) ? (data.stops as Nearby[]) : []))
          .catch(() => setPosError(t('Kunde inte hämta hållplatser nära dig.', 'Could not load stops near you.')))
          .finally(() => setLocating(false));
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          rememberPositionAllowed(false);
          const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
          setPosError(
            ios
              ? t(
                  'Platstjänster är avstängda för sidan. Slå på dem under Inställningar → Integritet och säkerhet → Platstjänster → Safari-webbplatser → Vid användning. Eller sök i fältet ovan.',
                  'Location is turned off for this site. Turn it on under Settings → Privacy & Security → Location Services → Safari Websites → While Using. Or search above.'
                )
              : t(
                  'Du har inte gett sidan tillgång till din position. Tillåt den i webbläsarens inställningar för webbplatsen, eller sök i fältet ovan.',
                  'This site is not allowed to use your location. Allow it in the browser settings for the site, or search above.'
                )
          );
        } else {
          setPosError(
            t(
              'Positionen hittades inte just nu. Inomhus och under jord är signalen ofta svag. Försök igen, eller sök i fältet ovan.',
              'Your location could not be found right now. Signal is often weak indoors and underground. Try again, or search above.'
            )
          );
        }
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  // Har man sagt ja en gång används positionen direkt.
  useEffect(() => {
    if (positionAllowed()) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Närmast först bland dina hållplatser, när positionen finns. Samma station kan ha flera id:n.
  const distanceOf = (s: StopOption) => {
    if (!nearby) return Infinity;
    const ids = s.id.split(',');
    const hit = nearby.find((n) => n.id.split(',').some((id) => ids.includes(id)) || n.name === s.name);
    return hit ? hit.distance : Infinity;
  };
  const mine = nearby ? [...stops].sort((a, b) => distanceOf(a) - distanceOf(b)) : stops;
  const others = (nearby || []).filter((n) => distanceOf(n) === Infinity || !mine.some((m) => distanceOf(m) === n.distance)).filter(
    (n) => !mine.some((m) => m.name === n.name)
  );
  // Ny användare (inga egna hållplatser): nära dig först.
  const fresh = mine.length === 0;

  const nearSection = (
    <section aria-label={t('Nära dig', 'Near you')} style={{ marginBottom: '22px' }}>
      <h2 style={label}>{t('Linjer nära dig', 'Lines near you')}</h2>
      {nearby === null ? (
        <button type="button" onClick={locate} disabled={locating} style={outlineButton}>
          {locating ? t('Söker din position…', 'Finding your location…') : t('Visa hållplatser nära mig', 'Show stops near me')}
        </button>
      ) : others.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.875rem', color: colors.textDim }}>
          {fresh
            ? t('Hittade ingen hållplats nära dig.', 'No stop found near you.')
            : t('Dina hållplatser är de närmaste.', 'Your stops are the nearest ones.')}
        </p>
      ) : (
        <NearbyLines stops={others} now={now} onOpenStop={onOpenStop} exclude={new Set(Object.values(covered).flat())} />
      )}
      {posError ? <p style={{ margin: '8px 0 0', fontSize: '0.875rem', color: colors.textSoft, lineHeight: 1.5 }}>{posError}</p> : null}
    </section>
  );

  return (
    <div>
      <SmartSearch onOpenStop={onOpenStop} onGoal={onGoal} onOpenTrain={onOpenTrain} onOpenAirport={onOpenAirport} />
      {fresh ? nearSection : null}

      {!fresh ? (
        <section aria-label={t('Dina hållplatser', 'Your stops')} style={{ marginBottom: '22px' }}>
          <h2 style={label}>{t('Dina hållplatser', 'Your stops')}</h2>
          <ul style={list}>
            {mine.map((s) => (
              <StopRow
                key={s.id}
                stop={s}
                now={now}
                distance={distanceOf(s)}
                onOpen={() => onOpenStop(s)}
                onKeys={(keys) => setCovered((c) => (c[s.id]?.join() === keys.join() ? c : { ...c, [s.id]: keys }))}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {!fresh ? nearSection : null}


      <InstallApp />
    </div>
  );
}

/** En av dina hållplatser: namnet och de tre nästa avgångarna. Ett tryck öppnar tavlan. */
/**
 * Linjer nära dig: varje linje och riktning en gång, vid den hållplats där den är närmast.
 * Fyra busshållplatser med samma buss blir två rader, och T-banan längre bort syns också.
 */
function NearbyLines({
  stops,
  now,
  onOpenStop,
  exclude,
}: {
  stops: Nearby[];
  now: number;
  onOpenStop: (s: StopOption) => void;
  exclude: Set<string>;
}) {
  const { t, lang } = useLang();
  const [boards, setBoards] = useState<Record<string, Departure[]>>({});
  const [more, setMore] = useState(false);
  const key = stops.map((s) => s.id).join('|');

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all(
        stops.slice(0, 6).map((s) =>
          fetch(boardUrl(s.id, s.name, 'departures'))
            .then((r) => r.json())
            .then((d) => [s.id, Array.isArray(d.departures) ? d.departures : []] as const)
            .catch(() => [s.id, []] as const)
        )
      ).then((pairs) => {
        if (alive) setBoards(Object.fromEntries(pairs));
      });
    load();
    const timer = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  type Row = { d: Departure; stop: Nearby };
  const best = new Map<string, Row>();
  for (const stop of [...stops].sort((a, b) => a.distance - b.distance)) {
    for (const d of boards[stop.id] || []) {
      const at = parseLocal(d.expectedAt);
      if (d.status === 'cancelled' || (at !== null && at < now + 60_000)) continue;
      const k = groupKey(d);
      if (exclude.has(k)) continue;
      const had = best.get(k);
      // Närmaste hållplatsen vinner; på samma hållplats den första avgången.
      if (!had || (had.stop.id === stop.id && (parseLocal(had.d.expectedAt) ?? 0) > (at ?? 0))) best.set(k, { d, stop });
    }
  }
  // Ordning: närmast först, och på samma hållplats den som går först.
  const rows = Array.from(best.values()).sort(
    (a, b) => a.stop.distance - b.stop.distance || (parseLocal(a.d.expectedAt) ?? 0) - (parseLocal(b.d.expectedAt) ?? 0)
  );
  const loaded = Object.keys(boards).length > 0;
  const shown = more ? rows : rows.slice(0, 6);
  const nu = (x: string) => (x === 'Nu' ? t('Nu', 'Now') : x);

  if (!loaded) return <p style={{ margin: 0, fontSize: '0.875rem', color: colors.textDim }}>{t('Hämtar…', 'Loading…')}</p>;
  if (rows.length === 0)
    return <p style={{ margin: 0, fontSize: '0.875rem', color: colors.textDim }}>{t('Inga avgångar nära dig just nu.', 'No departures near you right now.')}</p>;

  return (
    <>
      <ul style={list}>
        {shown.map(({ d, stop }) => {
          const tint = lineColor(d);
          const late = d.status === 'delayed';
          return (
            <li key={groupKey(d)} style={rowItem}>
              <button type="button" onClick={() => onOpenStop(stop)} style={{ ...rowButton, alignItems: 'flex-start', padding: '10px 0' }}>
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    minWidth: '44px',
                    padding: '2px 6px',
                    paddingLeft: tint ? '10px' : '6px',
                    boxSizing: 'border-box',
                    border: `1.5px solid ${colors.badgeBorder}`,
                    boxShadow: tint ? `inset 5px 0 0 ${tint}` : 'none',
                    fontFamily: fonts.display,
                    fontWeight: 800,
                    fontSize: '0.875rem',
                    textAlign: 'center',
                  }}
                >
                  {lineLabel(lineBadge(d.line), lang)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.9375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span className="sr-only">{lineLabel(d.line, lang)} </span>
                    <span style={{ color: colors.textDim }}>{t('mot', 'to')} </span>
                    {d.destination}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.8125rem', color: colors.textDim }}>
                    {stop.name} · {stop.distance >= 1000 ? `${(stop.distance / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(stop.distance)} m`}
                  </span>
                </span>
                <span style={{ fontFamily: fonts.display, fontWeight: 800, whiteSpace: 'nowrap', color: late ? colors.amber : colors.text }}>
                  {nu(countdownFor(d, now))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length > 6 ? (
        <button type="button" onClick={() => setMore(!more)} style={{ ...textLink, marginTop: '6px' }}>
          {more ? t('Visa färre', 'Show fewer') : t(`Visa fler (${rows.length - 6})`, `Show more (${rows.length - 6})`)}
        </button>
      ) : null}
    </>
  );
}

/** En hållplats: namnet och nästa avgång per linje och riktning. Ett tryck öppnar tavlan. */
function StopRow({
  stop,
  now,
  distance,
  onOpen,
  onKeys,
}: {
  stop: StopOption;
  now: number;
  distance: number;
  onOpen: () => void;
  onKeys?: (keys: string[]) => void;
}) {
  const { t, lang } = useLang();
  const [deps, setDeps] = useState<Departure[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(boardUrl(stop.id, stop.name, 'departures'))
        .then((res) => res.json())
        .then((data) => {
          if (alive) setDeps(Array.isArray(data.departures) ? data.departures : []);
        })
        .catch(() => {
          if (alive) setDeps((d) => d || []);
        });
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [stop.id, stop.name]);

  // En rad per linje och riktning, med nästa avgång: så ser man åt vilket håll hållplatsen går.
  const seen = new Set<string>();
  const next = (deps || [])
    .filter((d) => {
      // Från Hem hinner man inte en avgång som går nu: visa den som går om minst en minut.
      const at = parseLocal(d.expectedAt);
      return at === null || at >= now + 60_000;
    })
    .filter((d) => {
      const key = groupKey(d);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
  const nu = (s: string) => (s === 'Nu' ? t('Nu', 'Now') : s);
  const keys = (deps || []).map(groupKey);
  // Nycklarna innehåller själva "|" (linje|mål), så de skiljs åt med radbrytning.
  const keyString = Array.from(new Set(keys)).sort().join('\n');
  useEffect(() => {
    if (onKeys && deps) onKeys(keyString ? keyString.split('\n') : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyString, deps === null]);

  return (
    <li style={rowItem}>
      <button type="button" onClick={onOpen} style={{ ...rowButton, flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '12px 0' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: fonts.display, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
            {stop.name}
          </span>
          {Number.isFinite(distance) ? (
            <span style={{ fontSize: '0.8125rem', color: colors.textDim }}>{Math.round(distance)} m</span>
          ) : null}
          <span aria-hidden="true" style={{ color: colors.textDim }}>
            →
          </span>
        </span>
        {deps === null ? (
          <span style={{ fontSize: '0.875rem', color: colors.textDim }}>{t('Hämtar…', 'Loading…')}</span>
        ) : next.length === 0 ? (
          <span style={{ fontSize: '0.875rem', color: colors.textDim }}>{t('Inga avgångar just nu', 'No departures right now')}</span>
        ) : (
          <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {next.map((d) => {
              const tint = lineColor(d);
              const late = d.status === 'delayed';
              const cancelled = d.status === 'cancelled';
              return (
                <span key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9375rem' }}>
                  <span
                    aria-hidden="true"
                    style={{
                      minWidth: '40px',
                      padding: '1px 5px',
                      paddingLeft: tint ? '9px' : '5px',
                      boxSizing: 'border-box',
                      border: `1.5px solid ${colors.badgeBorder}`,
                      boxShadow: tint ? `inset 4px 0 0 ${tint}` : 'none',
                      fontFamily: fonts.display,
                      fontWeight: 800,
                      fontSize: '0.8125rem',
                      textAlign: 'center',
                    }}
                  >
                    {lineLabel(lineBadge(d.line), lang)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span className="sr-only">{lineLabel(d.line, lang)} </span>
                    <span style={{ color: colors.textDim }}>{t('mot', 'to')} </span>
                    {d.destination}
                  </span>
                  <span
                    style={{
                      fontFamily: fonts.display,
                      fontWeight: 800,
                      color: cancelled || late ? colors.amber : colors.text,
                      textDecoration: cancelled ? 'line-through' : 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cancelled ? t('Inställd', 'Cancelled') : nu(countdownFor(d, now))}
                  </span>
                </span>
              );
            })}
          </span>
        )}
      </button>
    </li>
  );
}

const list: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${colors.text}` };
const rowItem: React.CSSProperties = { borderBottom: `1px solid ${colors.border}` };
const rowButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  minHeight: '52px',
  padding: '8px 0',
  border: 'none',
  background: 'none',
  color: colors.text,
  fontSize: '1rem',
  textAlign: 'left',
  cursor: 'pointer',
};
const outlineButton: React.CSSProperties = {
  minHeight: '48px',
  padding: '0 16px',
  border: `1px solid ${colors.text}`,
  background: 'transparent',
  color: colors.text,
  fontSize: '0.9375rem',
  fontWeight: 700,
  cursor: 'pointer',
};
const textLink: React.CSSProperties = {
  minHeight: '44px',
  padding: 0,
  border: 'none',
  background: 'none',
  color: colors.text,
  fontSize: '0.9375rem',
  fontWeight: 700,
  textDecoration: 'underline',
  textUnderlineOffset: '4px',
  cursor: 'pointer',
};

export { StopRow };
