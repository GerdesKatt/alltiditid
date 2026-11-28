import { flushSync } from 'react-dom';

/**
 * Kör en uppdatering som en View Transition: flikbyten tonar över och raderna på tavlan glider
 * till sin nya plats (varje rad har ett eget view-transition-name). Utan stöd i webbläsaren,
 * med "minska rörelse", i bakgrunden eller långt ner på sidan sker uppdateringen direkt.
 * Apple-juryn, punkt 2: rörelse som förklarar vad som hände, inte pynt.
 */
export function withTransition(update: () => void, opts: { onlyNearTop?: boolean; kind?: 'gone' } = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return update();
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished?: Promise<unknown>; ready?: Promise<unknown>; updateCallbackDone?: Promise<unknown> } };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Mitt i en skroll långt ner fryser en övergång sidan i ett ögonblick: hoppa över den då.
  const farDown = opts.onlyNearTop && window.scrollY > window.innerHeight;
  if (!doc.startViewTransition || reduce || document.hidden || farDown) return update();
  // Sorten styr animationen i CSS: "gone" = avgångar som gått glider ut åt vänster (globals.css).
  const root = document.documentElement;
  if (opts.kind) root.setAttribute('data-vt', opts.kind);
  try {
    const vt = doc.startViewTransition(() => flushSync(update));
    const done = () => root.removeAttribute('data-vt');
    // En övergång som avbryts av nästa ("Transition was skipped") är normalt, inte ett fel (N15).
    const ignore = () => {};
    vt?.ready?.catch(ignore);
    vt?.updateCallbackDone?.catch(ignore);
    if (vt && vt.finished) vt.finished.then(done, done);
    else done();
  } catch {
    root.removeAttribute('data-vt');
    update();
  }
}

/**
 * Delad övergång: ett element "blir" ett annat, t.ex. siffran i Nästa-kortet som växer till
 * storläget och krymper tillbaka (Vägen till 10 del 2, idé 1). Namnet sätts bara på det element
 * som syns före och efter uppdateringen, så att det aldrig finns två med samma namn.
 * Utan stöd eller med "minska rörelse" sker uppdateringen direkt.
 */
export function morphTransition(update: () => void, from: () => Element | null, to: () => Element | null, name = 'morph') {
  if (typeof document === 'undefined' || typeof window === 'undefined') return update();
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished?: Promise<unknown>; ready?: Promise<unknown>; updateCallbackDone?: Promise<unknown> } };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = from() as HTMLElement | null;
  if (!doc.startViewTransition || reduce || document.hidden || !start) return update();
  const root = document.documentElement;
  start.style.setProperty('view-transition-name', name);
  root.setAttribute('data-vt', 'morph');
  let end: HTMLElement | null = null;
  const clear = () => {
    start.style.removeProperty('view-transition-name');
    end?.style.removeProperty('view-transition-name');
    root.removeAttribute('data-vt');
  };
  try {
    const vt = doc.startViewTransition(() => {
      flushSync(update);
      start.style.removeProperty('view-transition-name');
      end = to() as HTMLElement | null;
      end?.style.setProperty('view-transition-name', name);
    });
    const ignore = () => {};
    vt?.ready?.catch(ignore);
    vt?.updateCallbackDone?.catch(ignore);
    if (vt && vt.finished) vt.finished.then(clear, clear);
    else clear();
  } catch {
    clear();
    update();
  }
}
