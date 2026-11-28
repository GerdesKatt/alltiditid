/**
 * "Hinner jag dit?": följer positionen medan funktionen är på och räknar gångtiden
 * till hållplatsen på tavlan. Positionen stannar i webbläsaren och sparas inte.
 * Bara valet (på/av och takt) sparas i local storage.
 */
import { useEffect, useRef, useState } from 'react';
import { loadStopIndex, stopPageFor } from './stopIndex';
import { blendFactor, clampFactor, distanceTo, MAX_WALK_METERS, paceSample, walkMinutes, type WalkPace } from './walk.mjs';

const KEY = 'alltiditid:walk';
/** Din egen takt mot den valda (del 2, idé 12). Bara ett tal, aldrig en position. */
const FACTOR_KEY = 'alltiditid:gangtakt';

function loadFactor(): number {
  try {
    return clampFactor(Number(window.localStorage.getItem(FACTOR_KEY) || '1'));
  } catch {
    return 1;
  }
}

type Saved = { on: boolean; pace: WalkPace };

export type WalkState =
  | { kind: 'off' }
  | { kind: 'locating' }
  | { kind: 'denied' }
  | { kind: 'error' }
  | { kind: 'far'; meters: number }
  | { kind: 'ready'; meters: number; minutes: number };

/** Sparat val, eller null om man aldrig har slagit gångtid på eller av. */
function load(): Saved | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (v && typeof v.on === 'boolean' && ['calm', 'normal', 'brisk'].includes(v.pace)) return v;
  } catch {
    // Inget sparat val.
  }
  return null;
}

function store(v: Saved): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Valet gäller tills sidan laddas om.
  }
}

export type Walk = ReturnType<typeof useWalk>;

export function useWalk(stopId: string) {
  const [saved, setSaved] = useState<Saved>({ on: false, pace: 'normal' });
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [failure, setFailure] = useState<'denied' | 'error' | null>(null);
  const [stop, setStop] = useState<{ lat: number; lon: number } | null>(null);

  // local storage finns bara i webbläsaren.
  // Gångtid utan tryck (Vägen till 10, idé 14): har man aldrig valt själv men redan gett webbläsaren
  // platsbehörighet, slås gångtiden på direkt. Ett eget "av" gäller alltid. Inget sparas förrän man väljer.
  useEffect(() => {
    const v = load();
    if (v) {
      setSaved(v);
      return;
    }
    let alive = true;
    try {
      navigator.permissions
        ?.query({ name: 'geolocation' as PermissionName })
        .then((p) => {
          if (alive && p.state === 'granted') setSaved({ on: true, pace: 'normal' });
        })
        .catch(() => {});
    } catch {
      // Ingen Permissions API: gångtiden slås på med ett tryck som förut.
    }
    return () => {
      alive = false;
    };
  }, []);

  // Hållplatsens koordinater ur hållplatslistan, först när funktionen är på.
  useEffect(() => {
    if (!saved.on || !stopId) return;
    let alive = true;
    setStop(null);
    loadStopIndex().then((index) => {
      const page = stopPageFor(index, stopId);
      if (alive) setStop(page ? { lat: page.lat, lon: page.lon } : null);
    });
    return () => {
      alive = false;
    };
  }, [saved.on, stopId]);

  const [factor, setFactor] = useState(1);
  useEffect(() => setFactor(loadFactor()), []);
  // Takten lär sig av hur fort du faktiskt närmar dig hållplatsen (del 2, idé 12).
  const lastSample = useRef<{ meters: number; t: number } | null>(null);
  useEffect(() => {
    lastSample.current = null;
  }, [stopId, saved.on]);
  useEffect(() => {
    if (!position || !stop) return;
    const meters = distanceTo(position, stop);
    if (meters === null) return;
    const now = Date.now();
    const before = lastSample.current;
    if (!before) {
      lastSample.current = { meters, t: now };
      return;
    }
    const sample = paceSample(before, { meters, t: now }, saved.pace);
    if (sample !== null) {
      const next = blendFactor(factor, sample);
      setFactor(next);
      try {
        window.localStorage.setItem(FACTOR_KEY, next.toFixed(3));
      } catch {
        // Takten gäller tills sidan laddas om.
      }
      lastSample.current = { meters, t: now };
    } else if (now - before.t > 10 * 60_000 || meters > before.meters + 50) {
      // Gamla eller bakåt: börja om från här.
      lastSample.current = { meters, t: now };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, stop]);

  // Följ positionen medan funktionen är på.
  useEffect(() => {
    if (!saved.on) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setFailure('error');
      return;
    }
    setFailure(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setFailure(null);
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => setFailure(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [saved.on]);

  function update(v: Saved) {
    setSaved(v);
    store(v);
    if (!v.on) setPosition(null);
  }

  let state: WalkState;
  if (!saved.on) state = { kind: 'off' };
  else if (failure) state = { kind: failure };
  else if (!position || !stop) state = { kind: 'locating' };
  else {
    const meters = distanceTo(position, stop);
    if (meters === null) state = { kind: 'error' };
    else if (meters > MAX_WALK_METERS) state = { kind: 'far', meters };
    else state = { kind: 'ready', meters, minutes: walkMinutes(meters, saved.pace, factor) };
  }

  return {
    state,
    /** Hållplatsens läge, när gångtiden är på (för regnet i Nästa-kortet). */
    stopAt: saved.on ? stop : null,
    pace: saved.pace,
    turnOn: () => update({ ...saved, on: true }),
    turnOff: () => update({ ...saved, on: false }),
    setPace: (pace: WalkPace) => update({ ...saved, pace }),
  };
}
