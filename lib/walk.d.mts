export type WalkPace = 'calm' | 'normal' | 'brisk';
export type WalkVerdict = { kind: 'go' | 'relax' | 'missed'; leaveIn: number };

export const WALK_PACES: Record<WalkPace, number>;
export const DETOUR: number;
export const MAX_WALK_METERS: number;
export const GO_NOW_MARGIN: number;
export const PLATFORM_MINUTES: Record<string, number>;

export function distanceTo(
  position: { lat: number; lon: number } | null | undefined,
  stop: { lat: number; lon: number } | null | undefined
): number | null;
export function walkMinutes(meters: number, pace?: WalkPace): number;
export function platformMinutes(mode: string | undefined): number;
export function walkVerdict(minutesLeft: number, walk: number, platform?: number): WalkVerdict;
