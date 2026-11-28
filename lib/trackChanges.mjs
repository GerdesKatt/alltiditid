// Spårbytet syns (Vägen till 10 del 2, idé 3). Appen minns spåret för varje avgång mellan
// hämtningarna. Ändras det står det gamla spåret kvar som "var" i tio minuter, så att raden och
// kortet kan visa "Spår 13a → 14". Ett missat spårbyte är ett missat tåg.

export const TRACK_CHANGE_KEEP_MS = 10 * 60_000;

const bare = (v) => String(v || '').trim();

/**
 * @param {Map<string, {track: string, from?: string, at?: number}>} memory Det som setts förut (ändras).
 * @param {object[]} list Tavlans avgångar från senaste hämtningen.
 * @param {number} now
 * @returns {object[]} Samma avgångar; de med nytt spår får previousTrack.
 */
export function markTrackChanges(memory, list, now) {
  const out = [];
  const seen = new Set();
  for (const d of Array.isArray(list) ? list : []) {
    const id = d && d.id ? String(d.id) : '';
    if (!id) {
      out.push(d);
      continue;
    }
    seen.add(id);
    const track = bare(d.track);
    const before = memory.get(id);
    let entry = before;
    if (!before) entry = { track };
    else if (track && before.track && track !== before.track) entry = { track, from: before.track, at: now };
    else if (track) entry = { ...before, track };
    if (entry.from && (entry.from === track || now - (entry.at || 0) > TRACK_CHANGE_KEEP_MS)) entry = { track };
    memory.set(id, entry);
    out.push(entry.from && track ? { ...d, previousTrack: entry.from } : d);
  }
  // Avgångar som inte längre finns glöms, så att minnet inte växer.
  for (const id of [...memory.keys()]) if (!seen.has(id)) memory.delete(id);
  return out;
}
