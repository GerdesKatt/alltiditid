import type { Departure, RiderMood } from './types';

/** "Buss 160" → "buss 160", men "Gröna linjen 19" och "SJ Snabbtåg 537" lämnas som de är. */
function lineInSentence(line: string): string {
  const generic = /^(Buss|Spårvagn|Tåg|Pendeltåg|Båt|Färja|Tunnelbana)\b/;
  return generic.test(line) ? line.charAt(0).toLowerCase() + line.slice(1) : line;
}

/**
 * Kort meddelande att skicka till den som väntar, t.ex.
 *   "Sitter på buss 160 mot Årstaberg. Avgår Gullmarsplan 08:45, i tid."
 *   "Sitter på pendeltåg 41 från Uppsala C. Framme vid Stockholm C 14:43, 5 min sen."
 */
export function buildShareMessage(
  trip: Departure,
  stopName: string,
  riderStatus: RiderMood,
  riderNote: string
): string {
  const isArrival = trip.directionType === 'arrivals';
  const delayed = trip.status === 'delayed';
  const time = delayed ? trip.newTime || trip.estimatedTime || trip.scheduledTime : trip.estimatedTime || trip.scheduledTime;
  const minutes = delayed && trip.delayMinutes ? trip.delayMinutes : 0;

  const statusText =
    riderStatus === 'on-time'
      ? 'i tid'
      : riderStatus === 'slightly-late'
      ? minutes
        ? `${minutes} min sen`
        : 'lite sen'
      : minutes
      ? `försenad ${minutes} min`
      : 'försenad';

  const line = lineInSentence(trip.line);
  const first = isArrival ? `Sitter på ${line} från ${trip.destination}.` : `Sitter på ${line} mot ${trip.destination}.`;
  const second = isArrival ? `Framme vid ${stopName} ${time}, ${statusText}.` : `Avgår ${stopName} ${time}, ${statusText}.`;
  const trimmed = riderNote.trim();
  const note = trimmed ? ` ${/[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`}` : '';

  return `${first} ${second}${note}`;
}
