/**
 * Stjärnan landar i listan (Vägen till 10, idé 11): när man sparar en hållplats flyger en kopia
 * av stjärnan till fliken Avgångar, där Sparade ligger på startsidan, och fliken nickar till.
 * Rumslig rörelse som visar var det sparade tog vägen. Ingen rörelse med "minska rörelse".
 */
export function flyStar(from: Element): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const target = document.querySelector<HTMLElement>('.app-tab[data-tab="trafik"] .app-tab-sym');
  const svg = from.querySelector('svg');
  if (!target || !svg || typeof (svg as Element).animate !== 'function') return;
  const a = svg.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  // Fliken syns inte (t.ex. under sidhuvudet på dator): ingen flygtur.
  if (b.width === 0 || b.bottom < 0 || b.top > window.innerHeight) return;

  const clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute('fill', 'var(--rose)');
  clone.removeAttribute('class');
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    margin: '0',
    zIndex: '300',
    pointerEvents: 'none',
    color: 'var(--c-text)',
  });
  document.body.appendChild(clone);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  // En båge: först lite uppåt, sedan ner mot fliken.
  const flight = clone.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 60}px) scale(1.25)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0.2 },
    ],
    { duration: 620, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
  );
  const land = () => {
    clone.remove();
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], {
      duration: 260,
      easing: 'ease-out',
    });
  };
  flight.onfinish = land;
  flight.oncancel = land;
}
