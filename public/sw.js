/*
 * Service worker för alltiditid.se.
 *
 * - Sidan och dess filer sparas, så att appen startar direkt från hemskärmen.
 * - Tavlor (GET /api/trafik?action=departures) hämtas alltid från nätet först.
 *   Bara om nätet inte svarar visas den senast sparade tavlan, märkt med när den
 *   hämtades (rubriken X-Alltiditid-Sparad), så att appen kan säga det tydligt.
 * - Sök, "nära mig" (POST) och allt från andra domäner, t.ex. Google Analytics,
 *   rörs inte och sparas aldrig.
 */

const VERSION = 'v2';
const SHELL = `alltiditid-skal-${VERSION}`;
const BOARDS = `alltiditid-tavlor-${VERSION}`;
const MAX_BOARDS = 12;
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('alltiditid-') && key !== SHELL && key !== BOARDS)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/api/trafik') {
    if (url.searchParams.get('action') === 'departures') event.respondWith(board(request));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(page(request));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || /\.(png|svg|webmanifest|ico)$/.test(url.pathname)) {
    event.respondWith(asset(request));
  }
});

/** Sidan: nätet först (så att nya versioner syns direkt), annars sparad kopia. */
async function page(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put('/', response.clone());
    return response;
  } catch (err) {
    const cached = (await cache.match('/')) || (await cache.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    throw err;
  }
}

/** Filer med versionsnummer i namnet ändras aldrig: sparad kopia först. */
async function asset(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** En tavla: nätet först. Utan nät: senast sparade tavlan, märkt med tiden den hämtades. */
async function board(request) {
  const cache = await caches.open(BOARDS);
  const key = boardKey(request.url);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const body = await response.clone().arrayBuffer();
      const headers = new Headers(response.headers);
      headers.set('X-Alltiditid-Sparad', String(Date.now()));
      await cache.put(key, new Response(body, { status: 200, headers }));
      trim(cache);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}

/** Samma tavla oavsett ordning på parametrarna. */
function boardKey(href) {
  const url = new URL(href);
  const params = new URLSearchParams();
  for (const name of ['action', 'stopId', 'direction', 'mode']) {
    if (url.searchParams.has(name)) params.set(name, url.searchParams.get(name));
  }
  return `${url.origin}/api/trafik?${params.toString()}`;
}

/** Behåll bara de senaste tavlorna. */
async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_BOARDS))) {
    await cache.delete(key);
  }
}
