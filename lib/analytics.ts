/**
 * Google Tag Manager / Google Analytics, bara med samtycke.
 *
 * Analyskakor kräver samtycke (9 kap. 28 § LEK), så GTM laddas först när
 * användaren har tryckt "Godkänn". Utan beslut eller vid "Neka" laddas ingenting
 * från Google. Valet sparas i localStorage och kan ändras under "Integritet".
 *
 * GA4 konfigureras inne i GTM-containern (taggen "Google-tagg" med ditt mätnings-id).
 */

export const GTM_ID = 'GTM-KDFMDNXF';
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

/** Laddar GTM. Anropas bara efter samtycke. Statistik tillåts, annonser aldrig. */
export function loadAnalytics(): void {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;

  const gtag = ensureGtag();
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  gtag('js', new Date());
  window.dataLayer!.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
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
