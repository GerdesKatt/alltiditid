import type { PlanLeg, PlanTrip } from './plannedTrip';

type Ride = Extract<PlanLeg, { kind: 'ride' }>;

export const TRIP_PACE: { normal: number; luggage: number };
export const TRIP_MARGIN: { normal: number; luggage: number };

export type TripStep =
  | { kind: 'before'; walk: boolean; walkMinutes: number; margin: number; leaveAt: number; leaveIn: number; departsIn: number; ride: Ride; later: Ride[] }
  | { kind: 'change'; departsIn: number; ride: Ride; later: Ride[] }
  | { kind: 'riding'; offIn: number; ride: Ride; next: Ride | null; later: Ride[] }
  | { kind: 'done' };

export function walkWithMargin(leg: PlanLeg | null | undefined, luggage?: boolean): number;
export function nextStep(trip: PlanTrip, now: number, opts?: { luggage?: boolean }): TripStep;
