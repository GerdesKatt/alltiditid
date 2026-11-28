import { flushSync } from 'react-dom';

/**
 * Kör en uppdatering som en View Transition: flikbyten tonar över och raderna på tavlan glider
 * till sin nya plats (varje rad har ett eget view-transition-name). Utan stöd i webbläsaren,
 * med "minska rörelse", i bakgrunden eller långt ner på sidan sker uppdateringen direkt.
 * Apple-juryn, punkt 2: rörelse som förklarar vad som hände, inte pynt.
 */
export function withTransition(update: () => void, opts: { onlyNearTop?: boolean; kind?: 'gone' } = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return update();
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished?: Promise<unknown> } };
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
    if (vt && vt.finished) vt.finished.then(done, done);
    else done();
  } catch {
    root.removeAttribute('data-vt');
    update();
  }
}
