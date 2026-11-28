'use client';
import React, { useEffect, useState } from 'react';
import type { Departure, StopOption, TransportMode } from '../lib/types';
import { badgeLook, colors, fonts } from './styles';
import { lineLabel, modeLabel, useLang } from '../lib/i18n';
import { countdownFor, groupKey, lineBadge, parseLocal, splitProduct } from '../lib/lineFormat';
import { boardUrl } from '../lib/prefetch';
import { positionAllowed, rememberPositionAllowed } from '../lib/visits';
import InstallApp from './InstallApp';
import SmartSearch from './SmartSearch';
import StrandedTips from './StrandedTips';
import { track } from '../lib/track';
import ModeFilter from './ModeFilter';
import { REGIONS } from '../lib/regions';

/** Tre stora stationer för den som är ny och inte har delat position: något att se direkt. */
const BIG_STATIONS: StopOption[] = REGIONS[0].stations.slice(0, 3);
import { loadHomeMode, MODE_CHOICES, storeHomeMode } from '../lib/modeMemory';

type Nearby = StopOption & { distance: number; modes?: string[] };

type Props = {
  /** Dina hållplatser (vanligaste + stjärnmärkta), högst tre. */
  stops: StopOption[];
  /** Webbläsarens sparade hållplatser är inlästa: först då vet vi om besökaren är ny. */
  ready?: boolean;
  now: number;
  onOpenStop: (stop: StopOption) => void;
  onOpenTrain: (number: string) => void;
  onOpenAirport: (iata: string) => void;
  /** Vart ska du? från Hem: öppnar Min resa och söker resan. */
  onGoal: (text: string) => void;
  /** Platsen man skrev in när positionen är avstängd (null när den tas bort); blir start för resor. */
  /** Ta bort en hållplats från Hem (id), eller glöm alla besök (null). */
  onForget?: (id: string | null) => void;
  onStartAt?: (start: { name: string; lat: number; lon: number } | null) => void;
};

const label: React.CSSProperties = {
  margin: '0 0 6px',
  fontFamily: 'var(--font-display)',
  fontStretch: 'var(--stretch-wide)',
  fontSize: 'var(--fs-1)',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: colors.textDim,
};

/**
 * Hem: dit Nu alltid leder. Dina hållplatser med nästa avgångar, det som är nära dig,
 * och sök. Positionen sorterar dina hållplatser (närmast först) och visar andra nära dig;
 * den frågas om först när man trycker, och sparas aldrig.
 */
export default function Home({ stops, ready = true, now, onOpenStop, onOpenTrain, onOpenAirport, onGoal, onStartAt, onForget }: Props) {
  const [editing, setEditing] = useState(false);
  const { t, lang } = useLang();
  const [nearby, setNearby] = useState<Nearby[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [posError, setPosError] = useState('');
  // Utan position: platsen man själv skrev in, och vad som står i fältet.
  const [manualPlace, setManualPlace] = useState('');
  // Positionen är avstängd (nekad i inställningarna): då visas fältet Var är du?
  const [denied, setDenied] = useState(false);
  // Var man är (avrundat), för tipsen när man är strandad. Sparas inte.
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [whereText, setWhereText] = useState('');

  function fromPlace(q: string) {
    const text = q.trim();
    if (text.length < 2) return;
    setLocating(true);
    fetch('/api/trafik?action=nearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, wide: true }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data.stops) || !data.place) {
          setPosError(t(`Hittade ingen plats som heter ”${text}”. Prova en hållplats eller en gatuadress.`, `Found no place called "${text}". Try a stop or a street address.`));
          return;
        }
        track('funktion', 0, 'nara_plats');
        setNearby(data.stops as Nearby[]);
        setManualPlace(String(data.place.name || text));
        if (Number.isFinite(data.place.lat) && Number.isFinite(data.place.lon)) {
          setHere({ lat: data.place.lat, lon: data.place.lon });
          onStartAt?.({ name: String(data.place.name || text), lat: data.place.lat, lon: data.place.lon });
        }
        setPosError('');
      })
      .catch(() => setPosError(t('Kunde inte hämta hållplatser just nu.', 'Could not load stops right now.')))
      .finally(() => setLocating(false));
  }
  // Linjer och riktningar som redan syns under Dina hållplatser: visas inte igen under Nära dig.
  const [covered, setCovered] = useState<Record<string, string[]>>({});
  // Trafikslag: T-bana, Buss, Tåg … för den som bara vill se sitt eget. Kommer ihåg valet.
  const [chosenMode, setChosenMode] = useState<TransportMode>('all');
  useEffect(() => setChosenMode(loadHomeMode()), []);
  // Trafikslagen som faktiskt går från varje hållplats och från Nära dig, för valen.
  const [present, setPresent] = useState<Record<string, string[]>>({});
  const reportModes = (id: string, modes: string[]) =>
    setPresent((p) => (p[id]?.join() === modes.join() ? p : { ...p, [id]: modes }));

  function locate() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDenied(true);
      setPosError(t('Webbläsaren kan inte ge din position.', 'Your browser cannot give your location.'));
      return;
    }
    setLocating(true);
    setPosError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        rememberPositionAllowed(true);
        setHere({ lat: Number(pos.coords.latitude.toFixed(3)), lon: Number(pos.coords.longitude.toFixed(3)) });
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
          setDenied(true);
          const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
          setPosError(
            ios
              ? t(
                  'Platstjänster är avstängda för sidan. Slå på dem under Inställningar → Integritet och säkerhet → Platstjänster → Safari-webbplatser → Vid användning. Eller skriv var du är:',
                  'Location is turned off for this site. Turn it on under Settings → Privacy & Security → Location Services → Safari Websites → While Using. Or type where you are:'
                )
              : t(
                  'Du har inte gett sidan tillgång till din position. Tillåt den i webbläsarens inställningar för webbplatsen, eller skriv var du är:',
                  'This site is not allowed to use your location. Allow it in the browser settings for the site, or type where you are:'
                )
          );
        } else {
          setPosError(
            t(
              'Telefonen hittar dig inte just nu. Inomhus och under jord är signalen svag. Försök igen, eller skriv var du är.',
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
  // Borta hemifrån: positionen finns men ingen av dina hållplatser är i närheten. Då kommer
  // det som går där du står först, och dina vanliga hållplatser under.
  const away = !fresh && nearby !== null && nearby.length > 0 && mine.every((s) => distanceOf(s) === Infinity);
  const nearFirst = fresh || away;

  // Bara de slag som går här visas. Finns det valda inte här (borta hemifrån) visas allt,
  // men valet ligger kvar till nästa gång man är hemma.
  const presentModes = new Set(Object.values(present).flat());
  const modeChoices = MODE_CHOICES.filter((m) => presentModes.has(m.key));
  const mode: TransportMode = chosenMode !== 'all' && presentModes.size > 0 && !presentModes.has(chosenMode) ? 'all' : chosenMode;
  const chooseMode = (m: TransportMode) => {
    setChosenMode(m);
    storeHomeMode(m);
    track('funktion', 0, 'trafikslag_hem');
  };
  const modeName = (m: TransportMode) => {
    const hit = MODE_CHOICES.find((c) => c.key === m);
    return hit ? modeWord(hit.label, lang) : '';
  };

  const nearSection = (
    <section aria-label={t('Nära dig', 'Near you')} style={{ marginBottom: '22px' }}>
      <h2 style={{ ...label, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {manualPlace ? `${t('Linjer nära', 'Lines near')} ${manualPlace}` : t('Linjer nära dig', 'Lines near you')}
        </span>
        {manualPlace ? (
          <button
            type="button"
            onClick={() => {
              setManualPlace('');
              setNearby(null);
              onStartAt?.(null);
              setPosError('');
            }}
            style={{ flexShrink: 0, border: 'none', background: 'none', padding: 0, color: colors.text, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
          >
            {t('Ändra', 'Change')}
          </button>
        ) : null}
      </h2>
      {nearby === null ? (
        <button type="button" onClick={locate} disabled={locating} style={outlineButton}>
          {locating ? t('Letar efter dig…', 'Looking for you…') : t('Visa linjer nära mig', 'Show lines near me')}
        </button>
      ) : others.length === 0 ? (
        fresh ? (
          <>
            <WayForward
              text={t(
                'Ingen hållplats inom en mil. Säg vart du ska, så hittar vi vägen.',
                'No stop within 10 km. Tell us where you are going and we will find the way.'
              )}
            />
            {here ? <StrandedTips lat={here.lat} lon={here.lon} /> : null}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--fs-2)', color: colors.textDim }}>
            {t('Dina hållplatser är de närmaste.', 'Your stops are the nearest ones.')}
          </p>
        )
      ) : (
        <NearbyLines
          stops={others}
          now={now}
          onOpenStop={onOpenStop}
          exclude={new Set(Object.values(covered).flat())}
          here={here}
          mode={mode}
          onModes={(m) => reportModes('nara', m)}
          onShowAll={() => chooseMode('all')}
        />
      )}
      {posError ? <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-2)', color: colors.textSoft, lineHeight: 1.5 }}>{posError}</p> : null}
      {denied && !manualPlace ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fromPlace(whereText);
          }}
          style={{ display: 'flex', marginTop: '12px' }}
        >
          <label htmlFor="var-ar-du" className="sr-only">
            {t('Var är du? Hållplats eller adress', 'Where are you? Stop or address')}
          </label>
          <input
            id="var-ar-du"
            type="text"
            autoComplete="off"
            enterKeyHint="search"
            value={whereText}
            onChange={(e) => setWhereText(e.target.value)}
            placeholder={t('Var är du? Hållplats eller adress', 'Where are you? Stop or address')}
            style={{ flex: 1, minWidth: 0, minHeight: '48px', padding: '0 12px', border: `1px solid ${colors.text}`, borderRight: 'none', borderRadius: 0, background: 'transparent', color: colors.text, fontSize: 'var(--fs-3)', fontFamily: 'inherit' }}
          />
          <button
            type="submit"
            disabled={locating || whereText.trim().length < 2}
            style={{ minHeight: '48px', padding: '0 16px', border: `1px solid ${colors.text}`, borderRadius: 0, background: colors.text, color: colors.bg, fontWeight: 700, fontSize: 'var(--fs-3)', cursor: 'pointer' }}
          >
            {locating ? t('Söker…', 'Searching…') : t('Visa', 'Show')}
          </button>
        </form>
      ) : null}
    </section>
  );

  return (
    <div>
      {ready && fresh ? (
        <section aria-label={t('Om appen', 'About the app')} style={{ margin: '0 0 16px' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--fs-5)', lineHeight: 1.25, color: colors.text }}>
            {t(
              'Nästa avgång, förseningar och om du hinner bytet.',
              'Your next departure, delays and whether you make the connection.'
            )}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-2)', lineHeight: 1.5, color: colors.textDim }}>
            {t(
              'Realtid för hela Sverige: lokalt, regionalt och flyg. Hållplatser du tittar på hamnar här, så att de syns direkt nästa gång.',
              "Real time for all of Sweden: local, regional and flights. Stops you look at appear here, so they show right away next time."
            )}
          </p>
        </section>
      ) : null}
      <SmartSearch onOpenStop={onOpenStop} onGoal={onGoal} onOpenTrain={onOpenTrain} onOpenAirport={onOpenAirport} />
      {modeChoices.length > 1 && !editing ? (
        <>
          {/* Säger vad flikarna gör: de gäller listorna nedanför (UX-revisionen, fynd 16). */}
          <h2 style={{ ...label, margin: '0 0 0' }}>{t('Trafikslag i listorna nedan', 'Modes in the lists below')}</h2>
          <ModeFilter modes={modeChoices} mode={mode} onChange={chooseMode} style={{ margin: '0 0 18px' }} />
        </>
      ) : null}
      {nearFirst ? nearSection : null}
      {/* Ny och utan position: svaret direkt, utan ett tryck. Tre stora stationer med nästa avgångar. */}
      {ready && fresh && nearby === null && !locating ? (
        <section aria-label={t('Stora stationer', 'Major stations')} style={{ marginBottom: '22px' }}>
          <h2 style={label}>{t('Stora stationer just nu', 'Major stations right now')}</h2>
          <ul style={list}>
            {BIG_STATIONS.map((s) => (
              <StopRow key={s.id} stop={s} now={now} distance={Infinity} onOpen={() => onOpenStop(s)} mode={mode} onModes={(m) => reportModes(s.id, m)} />
            ))}
          </ul>
        </section>
      ) : null}

      {!fresh ? (
        <section aria-label={t('Dina hållplatser', 'Your stops')} style={{ marginBottom: '22px' }}>
          <h2 style={{ ...label, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span>{t('Dina hållplatser', 'Your stops')}</span>
            {onForget ? (
              <button
                type="button"
                onClick={() => setEditing((e) => !e)}
                aria-pressed={editing}
                style={{ border: 'none', background: 'none', padding: 0, color: colors.text, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
              >
                {editing ? t('Klar', 'Done') : t('Ändra', 'Edit')}
              </button>
            ) : null}
          </h2>
          {editing ? (
            <>
              <ul style={list}>
                {mine.map((s) => (
                  <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', borderBottom: `1px solid ${colors.border}` }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <button
                      type="button"
                      onClick={() => onForget?.(s.id)}
                      aria-label={t(`Ta bort ${s.name}`, `Remove ${s.name}`)}
                      style={{ minHeight: '40px', padding: '0 14px', border: `1px solid ${colors.text}`, borderRadius: 0, background: 'transparent', color: colors.text, fontWeight: 700, fontSize: 'var(--fs-2)', cursor: 'pointer' }}
                    >
                      {t('Ta bort', 'Remove')}
                    </button>
                  </li>
                ))}
              </ul>
              <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-2)', color: colors.textSoft, lineHeight: 1.5 }}>
                {t('Borttagna hållplatser glöms helt, även stjärnan och sökningarna. ', 'Removed stops are forgotten completely, including the star and searches. ')}
                <button
                  type="button"
                  onClick={() => {
                    onForget?.(null);
                    setEditing(false);
                  }}
                  style={{ border: 'none', background: 'none', padding: 0, color: colors.text, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {t('Glöm alla besök', 'Forget all visits')}
                </button>
                {t(' (stjärnmärkta ligger kvar).', ' (starred stops stay).')}
              </p>
            </>
          ) : (
          <>
          <ul style={list}>
            {mine.map((s) => (
              <StopRow
                key={s.id}
                stop={s}
                now={now}
                distance={distanceOf(s)}
                onOpen={() => onOpenStop(s)}
                onKeys={(keys) => setCovered((c) => (c[s.id]?.join() === keys.join() ? c : { ...c, [s.id]: keys }))}
                mode={mode}
                onModes={(m) => reportModes(s.id, m)}
              />
            ))}
          </ul>
          {mode !== 'all' && mine.every((s) => present[s.id] && !present[s.id].includes(mode)) ? (
            <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-2)', color: colors.textDim }}>
              {t(`Inga avgångar med ${modeName(mode)} från dina hållplatser just nu. `, `No ${modeName(mode)} departures from your stops right now. `)}
              <button type="button" onClick={() => chooseMode('all')} style={{ border: 'none', background: 'none', padding: 0, color: colors.text, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
                {t('Visa alla', 'Show all')}
              </button>
            </p>
          ) : null}
          </>
          )}
        </section>
      ) : null}

      {!nearFirst ? nearSection : null}


      <InstallApp />
    </div>
  );
}

/** En av dina hållplatser: namnet och de tre nästa avgångarna. Ett tryck öppnar tavlan. */
/**
 * Linjer nära dig: varje linje och riktning en gång, vid den hållplats där den är närmast.
 * Fyra busshållplatser med samma buss blir två rader, och T-banan längre bort syns också.
 */
/** Inom så här många meter räknas en hållplats nära som samma plats som dina hållplatser. */
const SAME_PLACE_M = 600;

function NearbyLines({
  stops,
  now,
  onOpenStop,
  exclude,
  here,
  mode = 'all',
  onModes,
  onShowAll,
}: {
  stops: Nearby[];
  now: number;
  onOpenStop: (s: StopOption) => void;
  exclude: Set<string>;
  /** Var man är: för tipsen när inget går. */
  here: { lat: number; lon: number } | null;
  /** Valt trafikslag på Avgångar; 'all' visar allt. */
  mode?: TransportMode;
  /** Trafikslagen som går här, för valen ovanför. */
  onModes?: (modes: string[]) => void;
  onShowAll?: () => void;
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

  const modesHere = modesOf(stops.slice(0, 6).flatMap((s) => boards[s.id] || []));
  useEffect(() => {
    onModes?.(modesHere);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modesHere.join()]);

  type Row = { d: Departure; stop: Nearby };
  const best = new Map<string, Row>();
  // Avgångar som redan syns under Dina hållplatser: då är det inte "lugnt läge", bara redan visat.
  let alreadyShown = 0;
  for (const stop of [...stops].sort((a, b) => a.distance - b.distance)) {
    for (const d of boards[stop.id] || []) {
      const at = parseLocal(d.expectedAt);
      if (d.status === 'cancelled' || (at !== null && at < now + 60_000)) continue;
      if (mode !== 'all' && d.transportMode !== mode) continue;
      const k = groupKey(d);
      // Samma linje och riktning som dina hållplatser visar: en dubblett om hållplatsen ligger nära,
      // men längre bort (en bit längs linjen) är det nyttigt att se samma buss där också.
      if (exclude.has(k) && stop.distance < SAME_PLACE_M) {
        alreadyShown++;
        continue;
      }
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

  if (!loaded) return <p style={{ margin: 0, fontSize: 'var(--fs-2)', color: colors.textDim }}>{t('Hämtar…', 'Loading…')}</p>;
  // Ett trafikslag är valt men inget av det går här snart: säg det, och en väg tillbaka till allt.
  if (rows.length === 0 && mode !== 'all') {
    const name = modeWord(MODE_CHOICES.find((c) => c.key === mode)?.label || '', lang);
    return (
      <p style={{ margin: 0, fontSize: 'var(--fs-2)', color: colors.textDim }}>
        {t(`Inga avgångar med ${name} nära dig just nu. `, `No ${name} departures near you right now. `)}
        {onShowAll ? (
          <button type="button" onClick={onShowAll} style={{ border: 'none', background: 'none', padding: 0, color: colors.text, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
            {t('Visa alla', 'Show all')}
          </button>
        ) : null}
      </p>
    );
  }
  // Inga avgångar snart (landet, natten): visa ändå de närmaste hållplatserna, så att man kan se
  // när nästa går, och erbjud att planera resan. Appen ska alltid föreslå en väg framåt.
  if (rows.length === 0 && alreadyShown > 0)
    return (
      <p style={{ margin: 0, fontSize: 'var(--fs-2)', color: colors.textDim }}>
        {t('Allt här i närheten har du redan ovanför.', 'Everything nearby is already above.')}
      </p>
    );
  // Strandad på riktigt först när närmaste hållplats ligger en bit bort; i stan räcker listan.
  const nearest = Math.min(...stops.map((s) => s.distance));
  if (rows.length === 0)
    return (
      <>
        <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-2)', color: colors.textSoft, lineHeight: 1.5 }}>
          {t('Tyst på linjerna en stund. Nästa går härifrån:', 'Quiet on the lines for a while. The next one leaves from here:')}
        </p>
        <ul style={list}>
          {[...stops]
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 3)
            .map((s) => (
              <li key={s.id} style={rowItem}>
                <button type="button" onClick={() => onOpenStop(s)} style={{ ...rowButton, padding: '12px 0' }}>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700 }}>{s.name}</span>
                  <span style={{ flexShrink: 0, fontSize: 'var(--fs-2)', color: colors.textDim }}>
                    {formatDistance(s.distance)} →
                  </span>
                </button>
              </li>
            ))}
        </ul>
        <WayForward
          text={t('Eller säg vart du ska. Vi pusslar ihop resten.', 'Or tell us where you are going. We will piece together the rest.')}
        />
        {here && nearest >= 800 ? <StrandedTips lat={here.lat} lon={here.lon} /> : null}
      </>
    );

  return (
    <>
      <ul style={list}>
        {shown.map(({ d, stop }) => {
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
                    boxSizing: 'border-box',
                    ...badgeLook(d),
                    fontFamily: fonts.display,
                    fontWeight: 800,
                    fontSize: 'var(--fs-2)',
                    textAlign: 'center',
                  }}
                >
                  {lineLabel(lineBadge(d.line), lang)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--fs-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span className="sr-only">{lineLabel(d.line, lang)} </span>
                    <span style={{ color: colors.textDim }}>{t('mot', 'to')} </span>
                    {splitProduct(d.destination).place}
                  </span>
                  <span style={{ display: 'block', fontSize: 'var(--fs-2)', color: colors.textDim }}>
                    {stop.name} · {formatDistance(stop.distance)}
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
  mode = 'all',
  onModes,
}: {
  stop: StopOption;
  now: number;
  distance: number;
  onOpen: () => void;
  onKeys?: (keys: string[]) => void;
  /** Valt trafikslag på Avgångar; en hållplats utan det slaget döljs. */
  mode?: TransportMode;
  onModes?: (modes: string[]) => void;
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
    .filter((d) => mode === 'all' || d.transportMode === mode)
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
  const modesHere = deps ? modesOf(deps) : null;
  useEffect(() => {
    if (onModes && modesHere) onModes(modesHere);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modesHere?.join()]);

  // Ett annat trafikslag är valt och inget av det går härifrån: hållplatsen tar ingen plats.
  if (mode !== 'all' && deps && !deps.some((d) => d.transportMode === mode)) return null;

  return (
    <li style={rowItem}>
      <button type="button" onClick={onOpen} style={{ ...rowButton, flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '12px 0' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: fonts.display, fontSize: 'var(--fs-5)', fontWeight: 800, letterSpacing: '-0.015em' }}>
            {stop.name}
          </span>
          {Number.isFinite(distance) ? (
            <span style={{ fontSize: 'var(--fs-2)', color: colors.textDim }}>{Math.round(distance)} m</span>
          ) : null}
          <span aria-hidden="true" style={{ color: colors.textDim }}>
            →
          </span>
        </span>
        {deps === null ? (
          <span style={{ fontSize: 'var(--fs-2)', color: colors.textDim }}>{t('Hämtar…', 'Loading…')}</span>
        ) : next.length === 0 ? (
          <span style={{ fontSize: 'var(--fs-2)', color: colors.textDim }}>{t('Tomt på tavlan just nu.', 'Nothing on the board right now.')}</span>
        ) : (
          <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {next.map((d) => {
              const late = d.status === 'delayed';
              const cancelled = d.status === 'cancelled';
              return (
                <span key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--fs-3)' }}>
                  <span
                    aria-hidden="true"
                    style={{
                      minWidth: '40px',
                      padding: '1px 5px',
                      boxSizing: 'border-box',
                      ...badgeLook(d, { cancelled }),
                      fontFamily: fonts.display,
                      fontWeight: 800,
                      fontSize: 'var(--fs-2)',
                      textAlign: 'center',
                    }}
                  >
                    {lineLabel(lineBadge(d.line), lang)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span className="sr-only">{lineLabel(d.line, lang)} </span>
                    <span style={{ color: colors.textDim }}>{t('mot', 'to')} </span>
                    {splitProduct(d.destination).place}
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
  fontSize: 'var(--fs-3)',
  textAlign: 'left',
  cursor: 'pointer',
};
const outlineButton: React.CSSProperties = {
  minHeight: '48px',
  padding: '0 16px',
  border: `1px solid ${colors.text}`,
  background: 'transparent',
  color: colors.text,
  fontSize: 'var(--fs-3)',
  fontWeight: 700,
  cursor: 'pointer',
};
const textLink: React.CSSProperties = {
  minHeight: '44px',
  padding: 0,
  border: 'none',
  background: 'none',
  color: colors.text,
  fontSize: 'var(--fs-3)',
  fontWeight: 700,
  textDecoration: 'underline',
  textUnderlineOffset: '4px',
  cursor: 'pointer',
};

export { StopRow };

/** Aldrig en återvändsgränd: en förklaring och en knapp som tar en till sökfältet. */
function WayForward({ text }: { text: string }) {
  const { t } = useLang();
  return (
    <div style={{ marginTop: '10px' }}>
      <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-2)', color: colors.textSoft, lineHeight: 1.5 }}>{text}</p>
      <button
        type="button"
        onClick={() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          document.getElementById('sok-allt')?.focus();
        }}
        style={{ minHeight: '44px', padding: '0 16px', border: `1px solid ${colors.text}`, borderRadius: 0, background: 'transparent', color: colors.text, fontWeight: 700, fontSize: 'var(--fs-3)', cursor: 'pointer' }}
      >
        {t('Planera en resa', 'Plan a trip')}
      </button>
    </div>
  );
}

/** 180 m, 1,2 km, 6 km. */
function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return m < 10_000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 1000)} km`;
}

/** Trafikslagen bland avgångarna, t.ex. ["subway", "bus"]. */
function modesOf(deps: Departure[]): string[] {
  return Array.from(new Set(deps.map((d) => d.transportMode).filter((m): m is TransportMode => !!m && m !== 'all' && (m as string) !== 'other'))).sort();
}

/** "T-bana", "buss", "metro": trafikslaget mitt i en mening. */
function modeWord(label: string, lang: 'sv' | 'en'): string {
  if (lang === 'sv' && label === 'T-bana') return 'T‑bana';
  return modeLabel(label, lang).toLowerCase();
}
