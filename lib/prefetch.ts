/**
 * Tidig hämtning av tavlan (B3).
 *
 * Ett litet skript i <head> (se PREFETCH_SCRIPT) läser sparad hållplats ur adressen
 * eller localStorage och startar API-anropet medan sidans JavaScript laddas. Appen
 * tar sedan över svaret med takePrefetch(), en gång, om adressen är exakt densamma.
 */

declare global {
  interface Window {
    __alltiditidPrefetch?: { url: string; promise: Promise<Response> };
  }
}

/** Adressen för en tavla. Måste byggas likadant här och i skriptet nedan. */
export function boardUrl(stopId: string, stopName: string, direction: string): string {
  return `/api/trafik?action=departures&stopId=${encodeURIComponent(stopId)}&stopName=${encodeURIComponent(
    stopName
  )}&mode=all&direction=${direction}`;
}

export function takePrefetch(url: string): Promise<Response> | null {
  if (typeof window === 'undefined') return null;
  const pre = window.__alltiditidPrefetch;
  if (!pre) return null;
  delete window.__alltiditidPrefetch;
  return pre.url === url ? pre.promise : null;
}

/**
 * Körs före React. Samma regler som lib/savedStop.ts: adressen först, annars senaste
 * hållplats. Okända namn i adressen (snabbval byter namn) ger bara en miss, inget fel.
 */
export const PREFETCH_SCRIPT = `(function(){try{
var p=new URLSearchParams(location.search),id=(p.get('h')||'').trim(),n=(p.get('n')||'').trim().slice(0,80),d=p.get('visa')==='ankomster'?'arrivals':'departures';
if(!id){var s=JSON.parse(localStorage.getItem('alltiditid:senaste')||'null');if(s&&s.stop){id=String(s.stop.id||'');n=String(s.stop.name||'');d=s.direction==='arrivals'?'arrivals':'departures';}}
if(!/^\\d{6,12}(,\\d{6,12}){0,3}$/.test(id)||!n)return;
var u='/api/trafik?action=departures&stopId='+encodeURIComponent(id)+'&stopName='+encodeURIComponent(n)+'&mode=all&direction='+d;
window.__alltiditidPrefetch={url:u,promise:fetch(u)};
}catch(e){}})();`;
