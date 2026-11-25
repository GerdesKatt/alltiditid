import type { StopOption } from './types';

/**
 * Sparade hållplatser (favoriter) i localStorage. Bara id och namn, inget annat,
 * och de lämnar aldrig webbläsaren.
 */

const STORAGE_KEY = 'alltiditid:favoriter';
export const MAX_FAVORITES = 8;

function isValidId(id: string): boolean {
  return /^\d{6,12}(,\d{6,12}){0,3}$/.test(id);
}

export function loadFavorites(): StopOption[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const out: StopOption[] = [];
    for (const item of data) {
      const id = String(item?.id || '');
      const name = String(item?.name || '').slice(0, 80);
      if (!isValidId(id) || !name || seen.has(id)) continue;
      seen.add(id);
      out.push(item?.shortName ? { id, name, shortName: String(item.shortName).slice(0, 40) } : { id, name });
      if (out.length >= MAX_FAVORITES) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function storeFavorites(list: StopOption[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_FAVORITES)));
  } catch {
    // Privat läge eller fullt: favoriterna gäller då bara tills sidan laddas om.
  }
}

/** Lägger till eller tar bort hållplatsen. Nya hamnar sist; listan är högst MAX_FAVORITES lång. */
export function toggleFavorite(list: StopOption[], stop: StopOption): StopOption[] {
  if (list.some((s) => s.id === stop.id)) return list.filter((s) => s.id !== stop.id);
  if (list.length >= MAX_FAVORITES) return list;
  const entry: StopOption = stop.shortName
    ? { id: stop.id, name: stop.name, shortName: stop.shortName }
    : { id: stop.id, name: stop.name };
  return [...list, entry];
}
