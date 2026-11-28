// Gemensamma hjälpare för API-testerna: lokala tider och ett anrop till Pages-funktionen.
import { onRequest, resetSlShared } from '../functions/api/trafik.js';

const pad = (n) => String(n).padStart(2, '0');

/** Lokal tid (TZ=Europe/Stockholm) som 'YYYY-MM-DDTHH:MM:SS', m minuter från nu (+ sekunder). */
export function localAt(base, minutes, seconds = 0) {
  const d = new Date(base.getTime() + minutes * 60000 + seconds * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Nu, avrundat till hel minut. */
export function minuteNow() {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

export async function board(qs, env) {
  // Varje test har egna påhittade SL-svar: inget delat svar från förra testet.
  resetSlShared();
  const res = await onRequest({
    request: new Request(`https://alltiditid.se/api/trafik?${qs}`),
    env,
    waitUntil() {},
  });
  return { status: res.status, body: await res.json() };
}
