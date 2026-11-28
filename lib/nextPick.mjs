// Vilken avgång som står stort i "Nästa avgång" när man inte har någon vana på hållplatsen.

/** Spårtrafik först: på en tågstation är det tåget man oftast menar, inte bussen utanför. */
const MODE_ORDER = ['train', 'commuter', 'subway', 'tram', 'ferry', 'bus'];

/** Högst så här långt efter den allra första avgången får huvudtrafikslagets avgång ligga. */
export const MAIN_MODE_WINDOW_MS = 30 * 60_000;

/** En avgång i realtid får gå så här mycket senare än en tidtabellsavgång och ändå väljas före den. */
export const REALTIME_PREFERENCE_MS = 3 * 60_000;

/** Jämförbar form av ett stationsnamn: "Stockholm Centralstation" och "Stockholm C" blir samma. */
export function stationKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bcentralstation(en)?\b|\bcentral\b|\bcentrum\b/g, 'c')
    .replace(/\b(station|stationen|stn|tågstation|järnvägsstation|resecentrum)\b/g, ' ')
    .replace(/[^a-zåäöæøü0-9]+/g, '');
}

/**
 * Går avgången mot den station man står på? Då är den aldrig svaret på "när går nästa?"
 * (ett tåg som slutar här och står kvar som avgång). stopNames är hållplatsens namn,
 * kortnamn och delnamn, till exempel ["Stockholm C / T-Centralen", "Stockholm Centralstation"].
 */
export function goesToStop(destination, stopNames) {
  const dest = stationKey(destination);
  if (!dest) return false;
  for (const raw of stopNames || []) {
    for (const part of String(raw || '').split('/')) {
      const key = stationKey(part);
      if (key && key === dest) return true;
    }
  }
  return false;
}

/**
 * Är delhållplatsen samma plats som tavlan man tittar på? Då behöver raden inte säga det:
 * på "Stockholm C / T-Centralen" står inte "T-Centralen" eller "Centralstation" på varje rad,
 * men "City" och "Cityterminalen" (andra perronger) står kvar (Apple-juryn, punkt 5).
 */
export function sameAsBoard(label, boardName) {
  const key = stationKey(label);
  if (!key) return false;
  const parts = String(boardName || '').split('/').map(stationKey).filter(Boolean);
  return parts.some((p) => p === key || (key === 'c' && p.endsWith('c')));
}

const rankOf = (d) => {
  const r = MODE_ORDER.indexOf(d.transportMode);
  return r < 0 ? MODE_ORDER.length : r;
};

/**
 * Första avgången med hållplatsens huvudtrafikslag (det mest spårbundna som finns i listan),
 * om den går inom 30 minuter efter den allra första. Annars den allra första.
 * En avgång bara enligt tidtabell får ge plats åt en i realtid som går högst 3 minuter senare.
 * upcoming är sorterad på tid; atOf ger avgångstiden i ms.
 */
export function pickNextDeparture(upcoming, atOf) {
  if (!upcoming.length) return undefined;
  const best = Math.min(...upcoming.map(rankOf));
  const first = upcoming[0];
  let main = upcoming.find((d) => rankOf(d) === best);
  const firstAt = atOf(first);
  let mainAt = atOf(main);
  if (firstAt === null || mainAt === null) return first;
  if (main.hasRealtime === false) {
    const live = upcoming.find((d) => rankOf(d) === best && d.hasRealtime !== false && (atOf(d) ?? Infinity) - mainAt <= REALTIME_PREFERENCE_MS);
    if (live) {
      main = live;
      mainAt = atOf(live);
    }
  }
  return mainAt - firstAt <= MAIN_MODE_WINDOW_MS ? main : first;
}
