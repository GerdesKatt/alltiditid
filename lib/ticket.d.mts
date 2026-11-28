import type { PlanTrip } from './plannedTrip';

export type TicketNumber = { kind: 'train' | 'flight'; number: string };
export type Anchor = {
  kind: 'train' | 'flight';
  /** Tågnummer eller flightnummer. */
  number: string;
  /** "Tåg 7063", "Flyg SK1415" */
  label: string;
  operator?: string;
  /** Avgångsdatum och tid enligt biljetten. */
  date: string;
  dep: string;
  from: string;
  track?: string;
  to: string;
  arr?: string;
  arrDate?: string;
  /** Minuter man bör vara på plats före avgång. */
  margin: number;
  /** Flygplatsens IATA-kod, för att följa flyget. */
  airport?: string;
  /** Flygets "YYYY-MM-DDTHH:MM", för att hitta det på tavlan. */
  scheduledAt?: string;
  /** Inskriven för hand: ingen realtid att följa. */
  manual?: boolean;
};
export type FlightMargin = { minutes: number; boarding: number; walk: number; queue: number; queueKnown: boolean; toSecurity: number; bags: number };

export function parseTicket(text: string): TicketNumber | null;
export const TRAIN_MARGIN: { big: number; small: number };
export function isBigStation(name: string): boolean;
export function trainMargin(stationName: string): number;
export const AIRPORT_ARRIVAL_WALK: number;
export const BAG_DROP: number;
export const DEFAULT_QUEUE: number;
export function flightMargin(
  flight: { airlineIata?: string; domestic?: boolean; terminal?: string } | null,
  airport: string,
  opts?: { queue?: number | null; bags?: boolean }
): FlightMargin | null;
export const AIRPORT_PLACES: Record<string, { name: string; lat: number; lon: number }>;
export function at(date: string, time: string): number;
export function clockOf(ms: number): { date: string; time: string };
export function deadline(anchor: Anchor): number;
export const EARLIER_MAX_MIN: number;
export function pickFeeder(trips: PlanTrip[], latestMs: number): { main: PlanTrip; backup: PlanTrip | null; tight: boolean } | null;
export function ticketTrip(feeder: PlanTrip, anchor: Anchor): PlanTrip;
export function withAnchorLive(trip: PlanTrip, live: { rtTime?: string; track?: string; cancelled?: boolean; arrRt?: string } | null): PlanTrip;
export function lateMinutes(time: string, rtTime: string): number;
export function alightFor(stops: { name: string }[], goal: string, boardIndex?: number): number;
