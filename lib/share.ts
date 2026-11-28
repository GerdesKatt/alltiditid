import type { Departure, StopOption } from './types';
import type { StopPage } from './stops';
import { clockFor } from './lineFormat';
import { lineLabel } from './i18n';
import type { Lang } from './lang';

const SITE = 'https://alltiditid.se';

/**
 * Länken till en hållplats tavla, för att dela. Hållplatser med egen sida får den
 * (/slussen, som har namnet i förhandsbilden), andra en länk som öppnar tavlan (/?h=…&n=…).
 * `kalla` sätts som utm_source, så att vi ser hur många som kom via en delad länk.
 */
export function boardShareUrl(stop: StopOption, page?: StopPage | null, kalla = 'dela'): string {
  const base = page ? `${SITE}/${page.slug}` : `${SITE}/?h=${encodeURIComponent(stop.id)}&n=${encodeURIComponent(stop.name)}`;
  if (!kalla) return base;
  return `${base}${base.includes('?') ? '&' : '?'}utm_source=${encodeURIComponent(kalla)}`;
}

/** "Buss 4 mot Radiohuset går 08:16 från Slussen." Inställd säger det i stället. */
export function departureShareText(item: Departure, stopName: string, lang: Lang): string {
  const line = lineLabel(item.line, lang);
  if (lang === 'en') {
    return item.status === 'cancelled'
      ? `${line} to ${item.destination} at ${item.scheduledTime} from ${stopName} is cancelled.`
      : `${line} to ${item.destination} leaves ${stopName} at ${clockFor(item)}.`;
  }
  return item.status === 'cancelled'
    ? `${line} mot ${item.destination} ${item.scheduledTime} från ${stopName} är inställd.`
    : `${line} mot ${item.destination} går ${clockFor(item)} från ${stopName}.`;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Telefonens egen delningsmeny när den finns, annars kopieras texten och länken.
 * Ett avbrutet delningsfönster är inget fel.
 */
export async function shareLink(data: { title: string; text?: string; url: string }): Promise<ShareResult> {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share(data);
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    // Annars: försök kopiera i stället.
  }
  try {
    await navigator.clipboard.writeText(data.text ? `${data.text} ${data.url}` : data.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
