// Korta länkar för QR-lappar och inlägg (tillväxtplanen, ändring 4).
//
//   alltiditid.se/q/cafe-x               → /?utm_source=qr-cafe-x
//   alltiditid.se/q/cafe-x/slussen       → /slussen?utm_source=qr-cafe-x
//   alltiditid.se/q/hotell-y/flyg/arlanda → /flyg/arlanda?utm_source=qr-hotell-y
//
// Koden blir källan i mätningen (lib/source.mjs), så att vi ser vilken lapp som gav besök.
// Bara egna sökvägar: en kort länk kan aldrig skicka vidare till en annan sajt.

const CODE = /^[a-z0-9][a-z0-9-]{0,23}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** Sökvägen och parametrarna att skicka vidare till, eller null om det inte är en kort länk. */
export function shortLinkTarget(pathname) {
  const parts = String(pathname || '')
    .toLowerCase()
    .split('/')
    .filter(Boolean);
  if (parts[0] !== 'q' || parts.length < 2 || parts.length > 4) return null;
  const code = parts[1];
  if (!CODE.test(code)) return null;
  const rest = parts.slice(2);
  if (!rest.every((p) => SLUG.test(p))) return null;
  if (rest.length === 2 && rest[0] !== 'flyg') return null;
  const path = rest.length ? `/${rest.join('/')}` : '/';
  return `${path}?utm_source=qr-${code}`;
}
