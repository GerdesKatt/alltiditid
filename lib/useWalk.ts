/**
 * "Hinner jag dit?": följer positionen medan funktionen är på och räknar gångtiden
 * till hållplatsen på tavlan. Positionen stannar i webbläsaren och sparas inte.
 * Bara valet (på/av och takt) sparas i local storage.
 */
import { useEffect, useState } from 'react';
import { loadStopIndex, stopPageFor } from './stopIndex';
import { distanceTo, MAX_WALK_METERS, walkMinutes, type WalkPace } from './walk.mjs';

const KEY = 'alltiditid:walk';

type Saved = { on: boolean; pace: WalkPace };

export type WalkState =
  | { kind: 'off' }
  | { kind: 'locating' }
  | { kind: 'denied' }
  | { kind: 'error' }
  | { kind: 'far'; meters: number }
  | { kind: 'ready'; meters: number; minutes: number };

function load(): Saved {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (v && typeof v.on === 'boolean' && ['calm', 'normal', 'brisk'].includes(v.pace)) return v;
  } catch {
    // Inget sparat val.
  }
  return { on: false, pace: 'normal' };
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
  useEffect(() => setSaved(load()), []);

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
    else state = { kind: 'ready', meters, minutes: walkMinutes(meters, saved.pace) };
  }

  return {
    state,
    pace: saved.pace,
    turnOn: () => update({ ...saved, on: true }),
    turnOff: () => update({ ...saved, on: false }),
    setPace: (pace: WalkPace) => update({ ...saved, pace }),
  };
}
