import type { Departure, RiderMood } from './types';

export function buildShareMessage(
  trip: Departure,
  stopName: string,
  riderStatus: RiderMood,
  riderNote: string
): string {
  const effectiveNewTime =
    trip.status === 'delayed' ? trip.newTime || trip.estimatedTime || '' : '';
  const delayLabel =
    trip.status === 'delayed' && trip.delayMinutes && trip.delayMinutes > 0
      ? ` (+${trip.delayMinutes} min)`
      : '';

  const statusText =
    riderStatus === 'on-time'
      ? 'är i tid'
      : riderStatus === 'slightly-late'
      ? `är lite sen${delayLabel}`
      : `är försenad${delayLabel}`;

  const isArrival = trip.directionType === 'arrivals';
  const timeLabel = isArrival ? 'ankomst' : 'avgång';
  const timePart = effectiveNewTime
    ? `ord. ${timeLabel} ${trip.scheduledTime}, ny tid ${effectiveNewTime}${delayLabel}`
    : `${timeLabel} ${trip.scheduledTime}`;

  const routePart = isArrival
    ? `till ${stopName} (från ${trip.destination})`
    : `från ${stopName} mot ${trip.destination}`;

  const notePart = riderNote.trim() ? ` (${riderNote.trim()})` : '';

  return `Jag sitter på (${trip.operator} ${trip.line}) ${routePart} (${timePart}) – ${statusText}${notePart}.`;
}
