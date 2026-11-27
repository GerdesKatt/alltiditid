export type CountyTraffic = { key: string; match: string[]; name: string; url: string };
export const COUNTY_TRAFFIC: CountyTraffic[];
export function trafficForCounty(state: string | null | undefined): CountyTraffic | null;
