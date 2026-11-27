/**
 * Kommer ihåg om erbjudandet om Bevakning ska visas: bara i webbläsaren (localStorage).
 * 'dismissed' = "Nej tack", 'joined' = anmäld till väntelistan.
 */
export type WatchPlan = 'month' | 'year' | 'free';
type Seen = 'dismissed' | 'joined';

const STORAGE_KEY = 'alltiditid-bevakning';

export function loadWatchOffer(): Seen | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'dismissed' || v === 'joined' ? v : null;
  } catch {
    return null;
  }
}

export function storeWatchOffer(value: Seen): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Privat läge: erbjudandet visas igen nästa gång, inget mer.
  }
}
