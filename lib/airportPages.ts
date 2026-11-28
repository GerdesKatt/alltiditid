import { AIRPORTS } from './flights.mjs';

/** En flygplats med egen sida (/flyg/arlanda), byggd från AIRPORTS i lib/flights.mjs. */
export type AirportPage = {
  iata: string;
  name: string;
  short: string;
  slug: string;
  /** Kötider i säkerhetskontrollen finns (Swedavias WaitTime). */
  waitTimes: boolean;
};

/** Adressen efter det namn folk söker på: "arlanda", "landvetter", "oslo-gardermoen". */
const SLUGS: Record<string, string> = {
  ARN: 'arlanda',
  GOT: 'landvetter',
  BMA: 'bromma',
  MMX: 'malmo-airport',
  LLA: 'lulea',
  UME: 'umea',
  OSD: 'ostersund',
  VBY: 'visby',
  KRN: 'kiruna',
  RNB: 'ronneby',
  OSL: 'oslo-gardermoen',
};

export const AIRPORT_PAGES: AirportPage[] = (AIRPORTS as { iata: string; name: string; short: string; waitTimes: boolean }[])
  .filter((a) => SLUGS[a.iata])
  .map((a) => ({ iata: a.iata, name: a.name, short: a.short, slug: SLUGS[a.iata], waitTimes: Boolean(a.waitTimes) }));

export function airportBySlug(slug: string): AirportPage | undefined {
  return AIRPORT_PAGES.find((a) => a.slug === slug);
}

export function airportPageFor(iata: string): AirportPage | undefined {
  const code = String(iata || '').toUpperCase();
  return AIRPORT_PAGES.find((a) => a.iata === code);
}

/** Texten i sökresultatet och förhandsbilden. */
export function airportDescription(a: AirportPage): string {
  const queue = a.waitTimes ? ' och kötiden i säkerhetskontrollen' : '';
  return `Avgångar och ankomster på ${a.name} (${a.iata}) i realtid. Se gate, förseningar, inställda flyg${queue}.`;
}
