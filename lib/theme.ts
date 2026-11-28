/**
 * Ljus eller mörk skärm. Följer telefonen ("auto") tills man väljer själv; valet sparas i
 * webbläsaren och sätts som data-theme på <html> (se THEME_SCRIPT, som körs innan sidan ritas).
 */
export type ThemeChoice = 'auto' | 'light' | 'dark';
const KEY = 'alltiditid:tema';

export function loadTheme(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  // Statusfältet i telefonen: följ valet, eller telefonen.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute('data-media') || m.getAttribute('media') || '';
    if (!m.getAttribute('data-media')) m.setAttribute('data-media', media);
    if (choice === 'auto') m.setAttribute('media', media);
    else m.setAttribute('media', media.includes(choice) ? 'all' : 'not all');
  });
  try {
    if (choice === 'auto') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
  } catch {
    // Ingen lagring: valet gäller tills sidan laddas om.
  }
}

/** Körs i <head> före React: sätter sparat val direkt, så att sidan inte blinkar i fel färg. */
export const THEME_SCRIPT = `(function(){try{var v=localStorage.getItem('${KEY}');if(v==='light'||v==='dark')document.documentElement.setAttribute('data-theme',v);}catch(e){}})();`;

/**
 * Körs i <head>: strecket ritas och ordmärket tonar in en gång per besök (Vägen till 10, idé 5).
 * Aldrig med "minska rörelse", och inte igen vid omladdning i samma flik.
 */
export const INTRO_SCRIPT = `(function(){try{if(sessionStorage.getItem('alltiditid:intro'))return;sessionStorage.setItem('alltiditid:intro','1');if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;document.documentElement.setAttribute('data-intro','');}catch(e){}})();`;
