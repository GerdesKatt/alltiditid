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

/**
 * Hållplatsen heter efter platsen: "Herrängsplan" ↔ "Herrängen", "Fruängsgården" ↔ "Fruängen".
 * Minst sex gemensamma bokstäver i början, och det mesta av det kortare ordet.
 */
export function sharesStem(title, stopName) {
  const a = normalize(title).split(' ')[0] || '';
  const b = nameKey(stopName).split(' ')[0] || '';
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n >= 6 && n >= Math.min(a.length, b.length) * 0.7;
}

const ABBREV = /(\b[A-ZÅÄÖ]|\b(t\.ex|bl\.a|m\.m|s\.k|ca|kl|nr|st|resp|d\.v\.s|f\.d|e\.g|i\.e|approx|no))\.$/i;

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

/** Ord som brukar betyda att en mening är kul att läsa när man väntar. */
const FUN_WORDS = {
  sv: /(?<![\p{L}\p{N}])(endast|bara|första|äldsta|enda|största|minsta|längsta|högsta|avböjde|revs|rivs|brann|kallade?s|smeknamn|egentligen|ursprungligen|namn|uppkallad|döptes|legend|sägen|spök|kung|drottning|film|inspelad|berömd|känd|hemlig|förbjud|skandal|olycka|rekord|världens|Sveriges|ovanlig|märklig|kuriös|ännu|redan|trots|aldrig|tidigare|fram till|numera|sjö|slott|gård|fabrik|bryggeri|varv|krog|kvarn)(?![\p{L}\p{N}])/iu,
  en: /(?<![\p{L}\p{N}])(only|first|oldest|largest|smallest|longest|tallest|declined|demolished|burned|called|nickname|originally|named|legend|ghost|king|queen|film|famous|known|secret|banned|scandal|accident|record|world's|unusual|still|already|despite|never|formerly|until|castle|manor|factory|brewery|mill)(?![\p{L}\p{N}])/iu,
};
/** Det oväntade: "ännu 1913 bodde här endast", "avböjde", "världens första". */
const SURPRISE = {
  sv: /(?<![\p{L}\p{N}])(endast|bara|avböjde|aldrig|trots|ännu|enda|första|äldsta|världens|märklig|ovanlig|egentligen)(?![\p{L}\p{N}])/iu,
  en: /(?<![\p{L}\p{N}])(only|declined|never|despite|still|first|oldest|world's|unusual|actually)(?![\p{L}\p{N}])/iu,
};
/** Torra meningar som hör hemma i en uppslagsbok men inte på en busshållplats. */
const DRY = {
  sv: /(gränsar till|invånare|utländsk bakgrund|är en (stadsdel|tätort|småort|kommundel)|stadsdelsområde|ingår i|tillhör|postnummer|ISBN|koordinater|statistiska|kommunkod|Se även)/i,
  en: /(borders|inhabitants|population|is a (district|suburb|locality)|postal code|ISBN|coordinates|statistical|See also)/i,
};
/** Meningar som pekar bakåt och inte står på egna ben. */
const ANAPHOR = {
  sv: /^(Den|Det|Dessa|Detta|De|Han|Hon|Där|Då|Denna|Därefter|Sedan|Även|Också)(?![\p{L}])/u,
  en: /^(It|They|This|These|He|She|There|Then|Also)\b/,
};
const CUT_SECTIONS = /^==\s*(Noter|Källor|Referenser|Tryckta källor|Litteratur|Externa länkar|Se även|Vidare läsning|Bilder|Galleri|Notes|References|Sources|External links|See also|Further reading|Gallery)\s*==/im;

function sentencesOf(text) {
  const parts = String(text || '')
    .split(/\n+/)
    .filter((l) => l.trim() && !/^=+.*=+$/.test(l.trim()))
    .join(' ')
    .replace(/\((uttal|pronounced|listen|lyssna)[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÅÄÖÉ0-9”"])/u);
  const out = [];
  for (const p of parts) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ` ${p}`;
    else out.push(p.trim());
  }
  return out.filter(Boolean);
}

/** Poäng för hur kul en mening är att läsa i väntan på bussen. */
export function funScore(sentence, lang = 'sv') {
  const w = lang === 'en' ? 'en' : 'sv';
  const s = String(sentence || '');
  let score = 0;
  const fun = new Set((s.match(new RegExp(FUN_WORDS[w].source, 'giu')) || []).map((m) => m.toLowerCase()));
  score += Math.min(4, fun.size * 1.5);
  if (SURPRISE[w].test(s)) score += 1;
  if (/\b(1[2-9]\d\d|20[0-2]\d)(-talet)?\b/.test(s)) score += 2;
  else if (/\d/.test(s)) score += 1;
  if (/[”"«].+[”"»]/.test(s)) score += 1; // citat och gamla namn
  if (DRY[w].test(s)) score -= 3;
  if (s.length < 45 || s.length > 240) score -= 2;
  return score;
}

/**
 * Den roligaste meningen (eller två korta i rad) ur hela artikeln, i stället för den första.
 * Ingressen är ofta torr ("X är en stadsdel i …"); historiken längre ner är där det roliga finns.
 * Faller tillbaka på ingressen när inget sticker ut.
 */
export function funFact(fullText, intro, lang = 'sv', max = MAX_CHARS) {
  const body = String(fullText || '').split(CUT_SECTIONS)[0];
  const sentences = sentencesOf(body);
  let best = null;
  sentences.forEach((s, i) => {
    const score = funScore(s, lang) + (i === 0 ? -1 : 0);
    if (!best || score > best.score) best = { s, i, score };
  });
  if (!best || best.score < 2) return shortText(intro || fullText, max);
  let text = best.s;
  // "Den hette då Johanneshov …" behöver meningen före för att gå att förstå.
  const prev = sentences[best.i - 1];
  if (prev && ANAPHOR[lang === 'en' ? 'en' : 'sv'].test(text) && prev.length + text.length + 1 <= max) {
    text = `${prev} ${text}`;
  }
  // En kort mening blir bättre med nästa, om den hänger ihop ("Först 1930 köpte … Då ordnades …").
  const next = sentences[best.i + 1];
  if (next && text === best.s && text.length < 140 && text.length + next.length + 1 <= max && !DRY[lang === 'en' ? 'en' : 'sv'].test(next)) {
    text = `${text} ${next}`;
  }
  return text.length > max ? shortText(text, max) : text;
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
 * @returns {{ kind: 'station'|'place'|'namesake'|'area'|'nearby', around: object[], title: string, text: string, url: string, meters: number|null } | null}
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
    intro: String(page.extract || ''),
    url: `https://${words}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    meters: distanceOf(page) === null ? null : Math.round(distanceOf(page)),
  });

  const named = list
    .filter((p) => titleMatches(p.title, stopName) || (sharesStem(p.title, stopName) && distanceOf(p) !== null))
    .filter((p) => (distanceOf(p) ?? 0) <= AREA_MAX_M)
    .map((p) => ({ p, station: STATION_WORDS[words].test(p.title) || STATION_WORDS[words].test(firstSentence(p.extract)) }))
    .sort((a, b) => Number(b.station) - Number(a.station) || byDistance(a.p, b.p));
  const located = list.filter((p) => distanceOf(p) !== null).sort(byDistance);
  let chosen = null;
  if (named.length) {
    const p = named[0].p;
    chosen = make(p, named[0].station ? 'station' : titleMatches(p.title, stopName) ? 'place' : 'namesake');
  } else {
    const area = located.find((p) => distanceOf(p) <= AREA_MAX_M && AREA_WORDS[words].test(firstSentence(p.extract)));
    const near = located.find((p) => distanceOf(p) <= NEARBY_MAX_M);
    if (area) chosen = make(area, 'area');
    else if (near) chosen = make(near, 'nearby');
  }
  if (!chosen) return null;
  chosen.around = aroundOf(located, chosen.title, words);
  return chosen;
}

/** Runt hörnet: upp till tre andra platser inom AROUND_MAX_M, närmast först, inte stadsdelar. */
export const AROUND_MAX_M = 1000;
function aroundOf(located, chosenTitle, lang) {
  return located
    .filter((p) => p.title !== chosenTitle && distanceOf(p) <= AROUND_MAX_M)
    .filter((p) => !AREA_WORDS[lang].test(firstSentence(p.extract)))
    .filter((p) => typeof p.description === 'string' && p.description.trim())
    // Gator och torg är inte mycket att gå och titta på.
    .filter((p) => !/^(gata|gatan|väg|vägen|gång|torg|plats|bro|street|road|square|avenue)(?![\p{L}])/iu.test(p.description.trim()))
    .slice(0, 3)
    .map((p) => ({
      title: p.title,
      description: p.description.trim(),
      meters: Math.round(distanceOf(p)),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
    }));
}

/** Hela artikeln som ren text, för att hitta det roliga längre ner (funFact). */
export function wikiArticleUrl(title, lang = 'sv') {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'extracts',
    explaintext: '1',
    exsectionformat: 'wiki',
    redirects: '1',
    titles: String(title || ''),
  });
  return `https://${lang === 'en' ? 'en' : 'sv'}.wikipedia.org/w/api.php?${p.toString()}`;
}

/** Wikipedias API-adress för kuriosan: geosearch med koordinater, annars sökning på namnet. */
export function wikiQueryUrl({ name, lat, lon, lang = 'sv' }) {
  const host = `https://${lang === 'en' ? 'en' : 'sv'}.wikipedia.org/w/api.php`;
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'extracts|coordinates|pageprops|description',
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
    p.set('colimit', 'max');
  } else {
    p.set('generator', 'search');
    p.set('gsrsearch', String(name || '').slice(0, 80));
    p.set('gsrlimit', '5');
  }
  return `${host}?${p.toString()}`;
}
