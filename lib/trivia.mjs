/**
 * "Visste du?": kuriosa om en hållplats från Wikipedia (CC BY-SA, källan visas alltid).
 *
 * Pages-funktionen frågar Wikipedia om artiklar nära hållplatsen (geosearch) och den här
 * filen väljer en av dem. Rena funktioner utan nätverk, så att valet går att testa
 * (test/trivia.test.mjs).
 *
 * Ordning: 1) en artikel om själva stationen eller platsen den heter efter,
 * 2) stadsdelen eller orten den ligger i, 3) något annat alldeles i närheten.
 * För små busshållplatser finns sällan något om hållplatsen själv, då blir det 2 eller 3.
 */

/** Längre bort än så här är inte "i närheten" längre. */
export const NEARBY_MAX_M = 600;
/** Stadsdelens artikel har sin punkt i mitten av området, som kan ligga en bit bort. */
export const AREA_MAX_M = 2500;
/** Så långt tillbaka letar geosearch (Wikipedias gräns är 10 000 m). */
export const SEARCH_RADIUS_M = 2500;
/** Kuriosan ska gå att läsa på en blick: högst så här många tecken. */
export const MAX_CHARS = 320;

/** Ord i hållplatsnamn som inte finns i artikelns titel ("Lund C" → "Lund"). */
const NAME_NOISE = /\s+(c|central|centralstation|station|stn|busstation|bussterminal|resecentrum|terminal|tågstation|t-bana|spårvagn|hpl)$/i;

const STATION_WORDS = {
  sv: /station|hållplats|terminal|tunnelbana|spårväg|järnväg|pendeltåg|resecentrum|perrong/i,
  en: /station|railway|metro|underground|tram|bus terminal|interchange/i,
};
const AREA_WORDS = {
  // Artikeln ska handla om området självt ("X är en stadsdel …"), inte ett torg som ligger i en stadsdel.
  sv: /(?:^|\s)är (en|ett) (\S+ ){0,2}?(stadsdel|stadsdelsområde|tätort|småort|ort|by|kommundel|bostadsområde|område|förort|kvarter|socken|stadsområde|centralort|kommun)\b/i,
  en: /(?:^|\s)is an? (\S+ ){0,2}?(district|neighbourhood|neighborhood|suburb|village|locality|town|city|area|borough|parish|municipality)\b/i,
};

/** "Gullmarsplans tunnelbanestation" → "gullmarsplans tunnelbanestation" (utan skiljetecken). */
export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Det i hållplatsnamnet som ska stå först i en matchande artikeltitel. */
export function nameKey(stopName) {
  let s = String(stopName || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // "Stockholm Odenplan" → "Odenplan"? Nej: kommunprefix är sällsynta i Trafiklabs namn och
  // "Stockholm Södra" behöver båda orden. Bara brus i slutet tas bort.
  for (let i = 0; i < 2; i += 1) s = s.replace(NAME_NOISE, '');
  return normalize(s);
}

/** Titeln handlar om hållplatsen eller platsen den heter efter. */
export function titleMatches(title, stopName) {
  const key = nameKey(stopName);
  if (key.length < 3) return false;
  const t = normalize(title);
  // "Gullmarsplan" ↔ "Gullmarsplans tunnelbanestation", "Slussen" ↔ "Slussen".
  return t === key || t.startsWith(`${key} `) || t.startsWith(`${key}s `) || t === `${key}s`;
}

const ABBREV = /\b(t\.ex|bl\.a|m\.m|s\.k|ca|kl|nr|st|resp|d\.v\.s|f\.d|e\.g|i\.e|approx|no)\.$/i;

/** De första meningarna, högst MAX_CHARS tecken. Uttalsparenteser tas bort. */
export function shortText(extract, max = MAX_CHARS) {
  const clean = String(extract || '')
    .replace(/\((uttal|pronounced|listen|lyssna)[^)]*\)/gi, '')
    .replace(/\s*\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim();
  if (!clean) return '';
  const parts = clean.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖÉ0-9])/u);
  // Ihop igen där punkten var en förkortning ("t.ex. Stockholm").
  const sentences = [];
  for (const p of parts) {
    if (sentences.length && ABBREV.test(sentences[sentences.length - 1])) sentences[sentences.length - 1] += ` ${p}`;
    else sentences.push(p);
  }
  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
    if (out.length > max * 0.6) break;
  }
  if (!out) {
    // En enda lång mening: kapa vid ett ord.
    out = `${sentences[0].slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
  }
  return out;
}

function firstSentence(extract) {
  return String(extract || '').split(/(?<=[.!?])\s/)[0] || '';
}

function usable(page) {
  if (!page || !page.title || page.missing !== undefined) return false;
  if (page.pageprops && page.pageprops.disambiguation !== undefined) return false;
  if (/^(lista över|list of|förteckning)/i.test(page.title)) return false;
  return String(page.extract || '').trim().length >= 40;
}

function distanceOf(page) {
  const c = Array.isArray(page.coordinates) ? page.coordinates[0] : null;
  const d = c ? Number(c.dist) : NaN;
  return Number.isFinite(d) ? d : null;
}

/**
 * Väljer kuriosan bland Wikipedias sidor (query.pages från generator=geosearch eller
 * generator=search, med prop=extracts|coordinates|pageprops).
 * Utan avstånd (sökning på namn) godtas bara en titel som matchar hållplatsen.
 *
 * @returns {{ kind: 'station'|'place'|'area'|'nearby', title: string, text: string, url: string, meters: number|null } | null}
 */
export function pickTrivia(pages, stopName, lang = 'sv') {
  const list = (Array.isArray(pages) ? pages : Object.values(pages || {})).filter(usable);
  if (!list.length) return null;
  const words = lang === 'en' ? 'en' : 'sv';
  const byDistance = (a, b) => (distanceOf(a) ?? Infinity) - (distanceOf(b) ?? Infinity);

  const make = (page, kind) => ({
    kind,
    title: page.title,
    text: shortText(page.extract),
    url: `https://${words}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    meters: distanceOf(page) === null ? null : Math.round(distanceOf(page)),
  });

  const named = list
    .filter((p) => titleMatches(p.title, stopName))
    .filter((p) => (distanceOf(p) ?? 0) <= AREA_MAX_M)
    .map((p) => ({ p, station: STATION_WORDS[words].test(p.title) || STATION_WORDS[words].test(firstSentence(p.extract)) }))
    .sort((a, b) => Number(b.station) - Number(a.station) || byDistance(a.p, b.p));
  if (named.length) return make(named[0].p, named[0].station ? 'station' : 'place');

  const located = list.filter((p) => distanceOf(p) !== null).sort(byDistance);
  const area = located.find((p) => distanceOf(p) <= AREA_MAX_M && AREA_WORDS[words].test(firstSentence(p.extract)));
  if (area) return make(area, 'area');

  const near = located.find((p) => distanceOf(p) <= NEARBY_MAX_M);
  return near ? make(near, 'nearby') : null;
}

/** Wikipedias API-adress för kuriosan: geosearch med koordinater, annars sökning på namnet. */
export function wikiQueryUrl({ name, lat, lon, lang = 'sv' }) {
  const host = `https://${lang === 'en' ? 'en' : 'sv'}.wikipedia.org/w/api.php`;
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'extracts|coordinates|pageprops',
    exintro: '1',
    explaintext: '1',
    exsentences: '3',
    exlimit: '20',
    ppprop: 'disambiguation',
    redirects: '1',
  });
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    p.set('generator', 'geosearch');
    p.set('ggscoord', `${lat}|${lon}`);
    p.set('ggsradius', String(SEARCH_RADIUS_M));
    p.set('ggslimit', '20');
    p.set('codistancefrompoint', `${lat}|${lon}`);
  } else {
    p.set('generator', 'search');
    p.set('gsrsearch', String(name || '').slice(0, 80));
    p.set('gsrlimit', '5');
  }
  return `${host}?${p.toString()}`;
}
