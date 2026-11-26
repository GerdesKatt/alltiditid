// Språkens texter och format utan React, så att servern (hållplatssidorna) också kan
// använda dem. Hooken useLang finns i lib/i18n.ts.

import type { RegionKey } from './types';

export type Lang = 'sv' | 'en';

/** Webbläsarens språklista → sv eller en. Det första språk vi känner igen vinner. */
export function langFromBrowser(languages: readonly string[]): Lang {
  for (const l of languages) {
    const code = String(l || '').toLowerCase().split('-')[0];
    if (code === 'sv') return 'sv';
    if (code === 'en') return 'en';
  }
  return languages.length ? 'en' : 'sv';
}

/** Översätter med två texter: t('Avgångar', 'Departures'). */
export type T = <V>(sv: V, en: V) => V;

export function translator(lang: Lang): T {
  return (sv, en) => (lang === 'en' ? en : sv);
}

/** Språkets locale för datum och tal. */
export function locale(lang: Lang): string {
  return lang === 'en' ? 'en-GB' : 'sv-SE';
}

/** 1,5 km på svenska, 1.5 km på engelska. */
export function decimal(n: number, digits: number, lang: Lang): string {
  const s = n.toFixed(digits);
  return lang === 'en' ? s : s.replace('.', ',');
}

export const REGION_EN: Record<RegionKey, string> = {
  all: 'All of Sweden',
  stockholm: 'Stockholm',
  goteborg: 'Gothenburg',
  skane: 'Skåne',
};

/** Trafikslag och filterknappar, efter den svenska texten. */
const MODE_EN: Record<string, string> = {
  Alla: 'All',
  Tåg: 'Train',
  Pendel: 'Commuter',
  Pendeltåg: 'Commuter train',
  'T-bana': 'Metro',
  Tunnelbana: 'Metro',
  Spårvagn: 'Tram',
  Buss: 'Bus',
  'SL-buss': 'SL bus',
  'Tvärbana/Lokal': 'Light rail/Local',
  'Fjärr/Regional': 'Long-distance/Regional',
  'Pendel/Tåg': 'Commuter/Train',
  'Båt/Färja': 'Boat/Ferry',
  Båt: 'Boat',
  Färja: 'Ferry',
  Fjärrtåg: 'Long-distance train',
  'Pågatåg/Öresund': 'Pågatåg/Öresund',
  Flyg: 'Flights',
  // Anropsstyrd trafik (Trafiklabs TAXI): beställs i förväg.
  Anropsstyrd: 'On-demand',
  Linje: 'Line',
};

export function modeLabel(sv: string, lang: Lang): string {
  return lang === 'en' ? MODE_EN[sv] || sv : sv;
}

/** "T-bana, spårvagn och buss" / "metro, tram and bus". */
export function modesSentence(modes: string[], lang: Lang): string {
  if (lang === 'sv') {
    // Hårt bindestreck (U+2011) så att "T-bana" inte bryts mellan raderna.
    const words = modes.map((m) => (m === 'T-bana' ? 'T‑bana' : m.toLowerCase()));
    if (words.length <= 1) return words.join('');
    return `${words.slice(0, -1).join(', ')} och ${words[words.length - 1]}`;
  }
  const words = modes.map((m) => modeLabel(m, 'en').toLowerCase());
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

// Linjenamn från trafikbolagen: "Buss 160", "Gröna linjen 19", "Pendeltåg 41".
const LINE_PREFIX_EN: [RegExp, string][] = [
  [/^Pendeltåg\b/, 'Commuter train'],
  [/^Tunnelbana\b/, 'Metro'],
  [/^Spårvagn\b/, 'Tram'],
  [/^Buss\b/, 'Bus'],
  [/^Färja\b/, 'Ferry'],
  [/^Båt\b/, 'Boat'],
  [/^Tåg\b/, 'Train'],
  [/^Gröna linjen\b/, 'Green line'],
  [/^Röda linjen\b/, 'Red line'],
  [/^Blå linjen\b/, 'Blue line'],
  [/^Tvärbanan\b/, 'Tvärbanan light rail'],
  [/^Snabbtåg\b/, 'High-speed train'],
  [/^Regionaltåg\b/, 'Regional train'],
  [/^Nattåg\b/, 'Night train'],
  [/^Linje\b/, 'Line'],
];

/** Linjen på engelska när den börjar med ett allmänt ord; egennamn lämnas. */
export function lineLabel(line: string, lang: Lang): string {
  if (lang === 'sv' || !line) return line;
  for (const [re, en] of LINE_PREFIX_EN) {
    if (re.test(line)) return line.replace(re, en);
  }
  return line;
}

/** Var tåget är nu (lib/trains.mjs skriver det på svenska). */
export function trainPosition(text: string, lang: Lang): string {
  if (lang === 'sv' || !text) return text;
  return text
    .replace(/^Framme i /, 'Arrived at ')
    .replace(/^Har lämnat /, 'Has left ')
    .replace(/^Står i /, 'At ')
    .replace(/^Har inte avgått från (.+) än$/, 'Has not left $1 yet')
    .replace(/, nästa /, ', next ')
    .replace(/ · enligt tidtabell$/, ' · scheduled')
    .replace(/ · (\d+) min sen$/, ' · $1 min late')
    .replace(/ · (\d+) min tidig$/, ' · $1 min early')
    .replace(/ · i tid$/, ' · on time');
}

// Swedavias statustexter (FlightLegStatusSwedish, GateActionSwedish). Okända texter
// visas på svenska.
const FLIGHT_STATUS_EN: [RegExp, string][] = [
  [/^Beräknad\b/i, 'Estimated'],
  [/^Ny tid\b/i, 'New time'],
  [/^Landat\b/i, 'Landed'],
  [/^Landar\b/i, 'Landing'],
  [/^Avgått\b/i, 'Departed'],
  [/^Har lyft\b/i, 'Departed'],
  [/^Inställt?\b/i, 'Cancelled'],
  [/^Försenad?t?\b/i, 'Delayed'],
  [/^Gå till gate\b/i, 'Go to gate'],
  [/^Gate öppen\b/i, 'Gate open'],
  [/^Gate stängd\b/i, 'Gate closed'],
  [/^Gaten stänger\b/i, 'Gate closing'],
  [/^Stänger\b/i, 'Closing'],
  [/^Sista anrop\b/i, 'Final call'],
  [/^Ombordstigning\b/i, 'Boarding'],
  [/^Boarding\b/i, 'Boarding'],
  [/^Bagage på band\b/i, 'Baggage on belt'],
  [/^Bagageband\b/i, 'Baggage belt'],
  [/^Omdirigerad\b/i, 'Diverted'],
  [/^Enligt tidtabell\b/i, 'On schedule'],
  [/^I tid\b/i, 'On time'],
];

export function flightStatus(text: string | undefined, lang: Lang): string {
  if (!text || lang === 'sv') return text || '';
  for (const [re, en] of FLIGHT_STATUS_EN) {
    if (re.test(text)) return text.replace(re, en);
  }
  return text;
}

/** "Spår 2" → "Track 2", "Läge A" → "Stand A". */
export function trackLabel(track: string | undefined, lang: Lang): string {
  if (!track || lang === 'sv') return track || '';
  return track.replace(/^Spår\b/, 'Track').replace(/^Läge\b/, 'Stand');
}
