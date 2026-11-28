/**
 * Kvittot (Vägen till 10, idé 7): resor man följt hela vägen fram, räknade bara i webbläsaren.
 * Inget konto, inget skickas. Samma tur räknas en gång.
 */
const KEY = 'alltiditid:framme';
const MAX = 500;

function load(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Räknar turen som framme (en gång) och svarar med hur många resor som räknats totalt. */
export function recordArrival(tripKey: string): number {
  const list = load();
  if (!list.includes(tripKey)) {
    list.push(tripKey);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    } catch {
      // Räknaren gäller tills sidan laddas om.
    }
  }
  return list.length;
}
