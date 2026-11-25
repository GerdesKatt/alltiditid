/**
 * Google Analytics 4, bara med samtycke.
 *
 * Analyskakor kräver samtycke (9 kap. 28 § LEK), så Googles skript laddas först när
 * besökaren har tryckt "Godkänn". Utan beslut eller vid "Neka" laddas ingenting från
 * Google. Valet sparas i localStorage och kan ändras under "Integritet".
 *
 * GA_MEASUREMENT_ID är ditt mätnings-id från analytics.google.com (Administratör →
 * Dataströmmar), t.ex. "G-AB12CD34EF". Det är inte hemligt, det syns ändå i webbläsaren.
 * Tomt = Google Analytics är avstängt: ingen fråga om samtycke visas och inget laddas.
 * Besöksstatistik finns ändå i Cloudflare Web Analytics, som inte sätter några kakor.
 */

export const GA_MEASUREMENT_ID = 'G-L1Y7RMBZL7';
export const ANALYTICS_ENABLED = /^G-[A-Z0-9]{4,}$/.test(GA_MEASUREMENT_ID);
const STORAGE_KEY = 'alltiditid:statistik';

export type ConsentChoice = 'granted' | 'denied';

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

export function readConsent(): ConsentChoice | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function storeConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Privat läge: valet gäller bara den här sidvisningen.
  }
}

export function clearConsent(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignorera
  }
}

function ensureGtag(): Gtag {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    // Samma som Googles kodsnutt: gtag() lägger argumenten i dataLayer.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
  return window.gtag;
}

let loaded = false;

/** Laddar Google Analytics. Anropas bara efter samtycke. Statistik tillåts, annonser aldrig. */
export function loadAnalytics(): void {
  if (!ANALYTICS_ENABLED || loaded || typeof document === 'undefined') return;
  loaded = true;

  const gtag = ensureGtag();
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/** Återkallar samtycket: stoppar vidare mätning och tar bort Googles analyskakor. */
export function revokeAnalytics(): void {
  if (window.gtag) {
    window.gtag('consent', 'update', { analytics_storage: 'denied' });
  }
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.replace(/^www\./, '')}`];
  document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_') || name === '_gid')
    .forEach((name) => {
      domains.forEach((domain) => {
        document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
      });
    });
}
