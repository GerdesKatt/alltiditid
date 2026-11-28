import { useEffect, useState } from 'react';
import { SECONDS_BELOW_MS } from './countdown.mjs';

/**
 * Klockan för en enskild avgång: appens klocka tickar var 15:e sekund, men de sista två
 * minuterna räknar siffran i tiotal sekunder (Vägen till 10, idé 2). Då tickar bara den här
 * avgången varje sekund, inte hela appen.
 */
export function useLiveNow(now: number, expectedMs: number | null): number {
  const near = expectedMs !== null && expectedMs - now < SECONDS_BELOW_MS + 15_000 && expectedMs - now > -15_000;
  const [live, setLive] = useState(now);
  useEffect(() => {
    if (!near) return;
    setLive(Date.now());
    const id = setInterval(() => setLive(Date.now()), 1000);
    return () => clearInterval(id);
  }, [near]);
  return near ? Math.max(now, live) : now;
}
