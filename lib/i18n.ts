// Svenska och engelska. Svenskan är källan: texterna skrivs på plats som
// t('svensk text', 'English text'), så att ingen nyckel kan glömmas bort och
// komponenterna går att läsa som förut.
//
// Språket väljs så här: sparat val i webbläsaren, annars webbläsarens språk
// (svenska om svenska kommer före engelska i listan, annars engelska). Sidan
// byggs i förväg på svenska; i webbläsaren byts texten direkt efter laddning.

import { useSyncExternalStore } from 'react';
import { langFromBrowser, translator, type Lang, type T } from './lang';

export * from './lang';

const LANG_KEY = 'alltiditid:sprak';

function detect(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === 'sv' || saved === 'en') return saved;
  } catch {
    // Ingen lagring: webbläsarens språk.
  }
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
  return langFromBrowser(list.filter(Boolean));
}

let current: Lang | null = null;
const listeners = new Set<() => void>();

function getLang(): Lang {
  if (current === null) {
    current = detect();
    document.documentElement.lang = current;
  }
  return current;
}

export function setLang(next: Lang) {
  current = next;
  document.documentElement.lang = next;
  try {
    window.localStorage.setItem(LANG_KEY, next);
  } catch {
    // Valet gäller tills sidan laddas om.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Språket och t() i en komponent. Servern (och första renderingen) är alltid svensk. */
export function useLang(): { lang: Lang; t: T; setLang: (lang: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, getLang, () => 'sv' as Lang);
  return { lang, t: translator(lang), setLang };
}

