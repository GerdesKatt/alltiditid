export type Airport = { iata: string; name: string; short: string; waitTimes: boolean };
export const AIRPORTS: Airport[];
export function airportByIata(code: string | null | undefined): Airport | null;
export function utcToLocal(utc: string | null | undefined): string;
