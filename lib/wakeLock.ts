import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void> };
type WakeLockNav = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };

/**
 * Håller skärmen tänd medan `active` är sant, där webbläsaren kan (Screen Wake Lock).
 * Släpps när sidan hamnar i bakgrunden och tas igen när den syns.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;
    const nav = navigator as WakeLockNav;
    if (!nav.wakeLock) return;
    let sentinel: Sentinel | null = null;
    let alive = true;
    const take = () => {
      if (document.hidden || sentinel) return;
      nav.wakeLock!
        .request('screen')
        .then((s) => {
          if (alive) sentinel = s;
          else s.release().catch(() => {});
        })
        .catch(() => {
          // Nekat (t.ex. lågt batteri): skärmen släcks som vanligt.
        });
    };
    const onVisible = () => {
      if (document.hidden) sentinel = null; // webbläsaren släpper låset själv
      else take();
    };
    take();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
