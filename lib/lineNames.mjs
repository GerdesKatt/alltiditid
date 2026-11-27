// Linjenamn och spår i samma form överallt (Skånetrafik och danska tåg skriver dem annorlunda).

/**
 * Är namnet en hel sträcka i stället för ett linjenamn? "Lindängen-Södervärn-Malmö C-Västra hamnen",
 * "Malmö - Veberöd - Sjöbo" och "Ø Kalmar - Växjö - Hässleholm - Malmö - København" är det,
 * "Gröna linjen", "X-tåget" och "Arlanda Express" är det inte.
 */
export function isRouteName(name) {
  const n = String(name || '').replace(/^Ø\s+/, '').trim();
  const parts = n.split(/\s*-\s*/);
  if (parts.length < 2) return false;
  return parts.every((p) => p.length >= 3 && /^\p{Lu}/u.test(p));
}

/**
 * Kort linjenamn: sträckor byts mot trafikslaget ("Buss", "Tåg"), danska Öresundståg
 * ("Ø …") mot "Öresundståg". modeLabel är trafikslagets ord, t.ex. "Buss".
 */
export function shortLineName(name, modeLabel) {
  const raw = String(name || '').trim();
  if (/^Ø\s/.test(raw)) return 'Öresundståg';
  if (isRouteName(raw)) return modeLabel || raw;
  return raw;
}

/** Spår och läge i samma form: "1b" blir "Spår 1b" för spårtrafik och "Läge C" för bussar. */
export function trackText(value, mode) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^(spår|läge)\s/i.test(v)) return v;
  const rail = mode === 'train' || mode === 'commuter' || mode === 'subway';
  return `${rail ? 'Spår' : 'Läge'} ${v}`;
}
