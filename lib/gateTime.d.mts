import type { Flight, SecurityQueue } from './types';
export type GatePlan = {
  boarding: string;
  gateCloses: string;
  walkMin: number;
  walkMax: number;
  queue: number | null;
  atSecurity: string;
  atSecurityBefore: number;
};
export function clockMinus(localIso: string, minutes: number): string;
export function gateRules(airlineIata?: string, domestic?: boolean): { boardingBefore: number; closeBefore: number };
export function walkMinutes(airport: string, terminal?: string): [number, number];
export function gatePlan(flight: Flight, airport: string, queueMinutes?: number | null): GatePlan | null;
export function queuesForTerminal(queues: SecurityQueue[], terminal?: string): SecurityQueue[];
export function queueNowFor(queues: SecurityQueue[], terminal?: string): number | null;
export function typicalQueueFor(
  forecast: { date?: string; queues?: { name: string; fastTrack?: boolean; hours?: { hour: number; typical: number | null }[] }[] } | null,
  flight: Flight
): number | null;
