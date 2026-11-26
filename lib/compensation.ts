/**
 * Var man söker förseningsersättning: bolagets egen sida när vi känner till den,
 * annars Hallå konsuments översikt. Adresserna är kontrollerade mot bolagens webbplatser
 * (november 2026); en okänd operatör får aldrig en gissad länk.
 */
export type CompensationLink = { name: string; url: string };

const GENERAL = 'https://www.hallakonsument.se/varor-och-tjanster/resor/';

const KNOWN: { test: RegExp; name: string; url: string }[] = [
  { test: /mälartåg|mälardalstrafik/i, name: 'Mälartåg', url: 'https://malartag.se/en/customer-service/compensation-in-case-of-delay' },
  { test: /snälltåget/i, name: 'Snälltåget', url: 'https://www.snalltaget.se/en/delay' },
  { test: /öresundståg/i, name: 'Öresundståg', url: 'https://www.oresundstag.se/en/customer-support/compensation-incase-of-delays' },
  { test: /\bul\b|upptåget|upplands lokaltrafik/i, name: 'UL', url: 'https://ul.se/en/customer-service/delay-compensation' },
  { test: /\bsl\b|pendeltåg|storstockholms lokaltrafik|tunnelbana|tvärbanan/i, name: 'SL', url: 'https://sl.se/kundservice/forseningsersattning' },
  { test: /\bsj\b/i, name: 'SJ', url: 'https://www.sj.se/om-sj/regler-och-villkor/rattigheter-vid-forsening' },
];

/** `who` är operatör eller produkt, t.ex. "SJ", "SJ Snabbtåg" eller "Mälardalstrafik AB". */
export function compensationLink(...who: (string | undefined)[]): CompensationLink {
  const text = who.filter(Boolean).join(' ');
  const hit = KNOWN.find((k) => k.test.test(text));
  return hit ? { name: hit.name, url: hit.url } : { name: '', url: GENERAL };
}
