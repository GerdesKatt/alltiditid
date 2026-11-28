export const RAIN_MM: number;
export function smhiUrls(lat: number, lon: number): string[];
export function rainSoon(json: unknown, now: number): { wet: boolean; snow: boolean; mm: number } | null;
