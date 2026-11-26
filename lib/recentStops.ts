import type { StopOption } from './types';

/**
 * Senast sökta hållplatser (högst fem), visas under sökfältet. Bara id och namn,
 * sparat i webbläsaren.
 */
const STORAGE_KEY = 'alltiditid:sokta';
const MAX_RECENT = 5;

export function loadRecentStops(): StopOption[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data
      .map((d) => ({ id: String(d?.id || ''), name: String(d?.name || '').slice(0, 80) }))
      .filter((d) => /^\d{6,12}(,\d{6,12}){0,3}$/.test(d.id) && d.name)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** Lägger hållplatsen först och returnerar den nya listan. */
export function rememberStop(list: StopOption[], stop: StopOption): StopOption[] {
  const next = [{ id: stop.id, name: stop.name }, ...list.filter((s) => s.id !== stop.id)].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ingen lagring: listan gäller tills sidan laddas om.
  }
  return next;
}
