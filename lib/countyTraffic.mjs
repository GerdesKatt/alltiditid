/**
 * Länets trafikbolag, för tips när man är strandad: närtrafik (anropsstyrd trafik) bokas där.
 * Ordningen spelar roll: längre och mer specifika namn prövas först ("västra götaland" före "götaland").
 * Webbplatserna är bolagens startsidor; exakt bokningsinfo per region kommer senare (GTFS booking_rules).
 */
export const COUNTY_TRAFFIC = [
  { key: 'stockholm', match: ['stockholm'], name: 'SL', url: 'https://sl.se' },
  { key: 'uppsala', match: ['uppsala'], name: 'UL', url: 'https://www.ul.se' },
  { key: 'sodermanland', match: ['södermanland', 'sodermanland'], name: 'Sörmlandstrafiken', url: 'https://www.sormlandstrafiken.se' },
  { key: 'ostergotland', match: ['östergötland', 'ostergotland'], name: 'Östgötatrafiken', url: 'https://www.ostgotatrafiken.se' },
  { key: 'jonkoping', match: ['jönköping', 'jonkoping'], name: 'Jönköpings Länstrafik', url: 'https://www.jlt.se' },
  { key: 'kronoberg', match: ['kronoberg'], name: 'Länstrafiken Kronoberg', url: 'https://www.lanstrafikenkron.se' },
  { key: 'kalmar', match: ['kalmar'], name: 'Kalmar länstrafik', url: 'https://www.kalmarlanstrafik.se' },
  { key: 'gotland', match: ['gotland'], name: 'Gotlands kollektivtrafik', url: 'https://www.gotland.se/kollektivtrafiken' },
  { key: 'blekinge', match: ['blekinge'], name: 'Blekingetrafiken', url: 'https://www.blekingetrafiken.se' },
  { key: 'skane', match: ['skåne', 'skane', 'scania'], name: 'Skånetrafiken', url: 'https://www.skanetrafiken.se' },
  { key: 'halland', match: ['halland'], name: 'Hallandstrafiken', url: 'https://www.hallandstrafiken.se' },
  { key: 'vastragotaland', match: ['västra götaland', 'vastra gotaland'], name: 'Västtrafik', url: 'https://www.vasttrafik.se' },
  { key: 'varmland', match: ['värmland', 'varmland'], name: 'Värmlandstrafik', url: 'https://www.varmlandstrafik.se' },
  { key: 'orebro', match: ['örebro', 'orebro'], name: 'Länstrafiken Örebro', url: 'https://www.lanstrafiken.se' },
  { key: 'vastmanland', match: ['västmanland', 'vastmanland'], name: 'VL', url: 'https://www.vl.se' },
  { key: 'dalarna', match: ['dalarna'], name: 'Dalatrafik', url: 'https://www.dalatrafik.se' },
  { key: 'gavleborg', match: ['gävleborg', 'gavleborg'], name: 'X-trafik', url: 'https://www.xtrafik.se' },
  { key: 'vasternorrland', match: ['västernorrland', 'vasternorrland'], name: 'Din Tur', url: 'https://www.dintur.se' },
  { key: 'jamtland', match: ['jämtland', 'jamtland'], name: 'Länstrafiken i Jämtland', url: 'https://www.ltr.se' },
  { key: 'vasterbotten', match: ['västerbotten', 'vasterbotten'], name: 'Länstrafiken i Västerbotten', url: 'https://www.tabussen.nu' },
  { key: 'norrbotten', match: ['norrbotten'], name: 'Länstrafiken i Norrbotten', url: 'https://www.ltnbd.se' },
];

/** "Dalarnas län", "Dalarna County" → Dalatrafik. null om inget passar. */
export function trafficForCounty(state) {
  const s = String(state || '').toLowerCase();
  if (!s) return null;
  return COUNTY_TRAFFIC.find((c) => c.match.some((m) => s.includes(m))) || null;
}
