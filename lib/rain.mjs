/**
 * Vädret när det spelar roll (Vägen till 10, idé 17): SMHI:s öppna punktprognos (CC BY 4.0),
 * tolkad tåligt. Klarar både nya SNOW1gv1 och gamla PMP3gv2, eftersom formatet skiljer sig.
 * Testad i test/rain.test.mjs.
 */

/** Minst så här mycket nederbörd (mm/h) räknas som regn man märker. */
export const RAIN_MM = 0.2;

export function smhiUrls(lat, lon) {
  const la = Number(lat).toFixed(3);
  const lo = Number(lon).toFixed(3);
  return [
    `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lo}/lat/${la}/data.json`,
    `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lo}/lat/${la}/data.json`,
  ];
}

const AMOUNT = ['precipitation_amount_mean', 'pmean'];
const KIND = ['predominant_precipitation_type_at_surface', 'pcat'];

/** Ett värde ur en tidpunkt, oavsett om parametrarna är ett objekt eller en lista. */
function value(entry, names) {
  if (entry && entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)) {
    for (const n of names) if (Number.isFinite(Number(entry.data[n]))) return Number(entry.data[n]);
  }
  const list = Array.isArray(entry?.parameters) ? entry.parameters : Array.isArray(entry?.data) ? entry.data : [];
  for (const n of names) {
    const p = list.find((x) => x && x.name === n);
    const v = p ? (Array.isArray(p.values) ? p.values[0] : p.value) : undefined;
    if (Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Regnar det inom den närmaste timmen? Prognosens första timsteg som slutar efter `now`.
 * @returns {{ wet: boolean, snow: boolean, mm: number } | null} null om svaret inte gick att läsa.
 */
export function rainSoon(json, now) {
  const series = Array.isArray(json?.timeSeries) ? json.timeSeries : null;
  if (!series) return null;
  for (const e of series) {
    const at = Date.parse(e?.validTime || e?.time || '');
    if (!Number.isFinite(at) || at <= now) continue;
    if (at - now > 75 * 60_000) return { wet: false, snow: false, mm: 0 };
    const mm = value(e, AMOUNT);
    if (mm === null) return null;
    const kind = value(e, KIND);
    // Kategori 1 och 2 är snö respektive snöblandat regn i PMP3g; SNOW1g använder samma koder.
    return { wet: mm >= RAIN_MM, snow: kind === 1 || kind === 2, mm };
  }
  return null;
}
