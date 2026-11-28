// Störningstexter som trafikbolagen skickar dem, men bara på ett språk och bara när de säger något.
// SL skickar ofta svenska och engelska i samma text ("Tåg mot Hagsätra avgår från Gullmarsplan.
// Trains bound for Hagsätra depart from Gullmarsplan.") och Västtrafik ibland bara en rubrik
// ("Buss", "Åkareplatsen") (UX-revisionen, fynd 6 och 10).

const EN_WORDS = /\b(the|trains?|buses|bound|depart(s|ure)?|from|is|are|will|please|due to|lift|elevator|platform|closed|read more|instead|towards)\b/i;
const SV_WORDS = /(?:^|[^a-zåäö])(och|från|till|mot|är|går|inte|tåg|buss|avgår|läs mer|hissen|plattformen|ersätts|inställd|på|vid|av|kl)(?=$|[^a-zåäö])/i;

/** Delar texten i meningar och behåller de som är på valt språk. Finns inga sådana: hela texten. */
export function textInLanguage(text, lang = 'sv') {
  const t = String(text || '').trim();
  const sentences = t.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ])/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length < 2) return t;
  const isEnglish = (s) => EN_WORDS.test(s) && !SV_WORDS.test(s);
  const keep = sentences.filter((s) => (lang === 'en' ? isEnglish(s) : !isEnglish(s)));
  return keep.length ? keep.join(' ') : t;
}

const MEANINGFUL = /inställ|försen|stäng|ersätt|byt|går inte|omled|hiss|rulltrapp|spår|avbrott|stopp|fel|ändr|flytt|olycka|arbete/i;

/** Säger texten något? En eller två ord utan händelse ("Buss", "NE Terminalen") gör det inte. */
export function saysSomething(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const words = t.split(/\s+/).length;
  return words >= 3 || MEANINGFUL.test(t);
}
