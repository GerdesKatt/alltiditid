/**
 * Övervakning: vilka externa källor API:t anropar, hur ofta det går fel och hur
 * nära månadskvoterna vi ligger. Räknas per dygn i D1 (tabellen upstream_calls)
 * och läses av /api/trafik?action=health, som den schemalagda kontrollen på
 * GitHub frågar var 30:e minut.
 */

/** Källorna, efter värdnamn. Okända värdar räknas under sitt eget namn. */
const SOURCES = {
  'realtime-api.trafiklab.se': 'trafiklab-realtime',
  'api.resrobot.se': 'resrobot',
  'opendata.samtrafiken.se': 'gtfs-rt',
  'api.trafikinfo.trafikverket.se': 'trafikverket',
  'api.swedavia.se': 'swedavia',
  'transport.integration.sl.se': 'sl',
  'ext-api.vasttrafik.se': 'vasttrafik',
  'sv.wikipedia.org': 'wikipedia',
  'en.wikipedia.org': 'wikipedia',
};

/**
 * Månadskvoter (rullande 30 dygn) för källor som har en. Byt nivå här när
 * Trafiklab godkänner en uppgradering: Brons 100 000, Silver 5 000 000.
 */
export const MONTHLY_QUOTAS = {
  'trafiklab-realtime': 5000000, // Silver sedan 2026-11-27
  resrobot: 200000, // Silver sedan 2026-11-27
  'gtfs-rt': 30000,
  swedavia: 10000,
};

/** Larma när så stor andel av kvoten är använd. */
export const QUOTA_WARN = 0.8;
/** Larma när så stor andel av dygnets anrop till en källa har misslyckats... */
export const FAILURE_WARN = 0.2;
/** ...men bara när källan fått minst så många anrop, så att enstaka fel inte larmar. */
export const FAILURE_MIN_CALLS = 20;

/** Källans namn för en adress. */
export function sourceOf(url) {
  try {
    const host = new URL(String(url)).hostname;
    return SOURCES[host] || host;
  } catch {
    return 'okänd';
  }
}

/** Räknas svaret som ett fel hos källan? 404 är ett vanligt svar (t.ex. okänd hållplats). */
export function isFailure(status) {
  return !(status >= 200 && status < 400) && status !== 404;
}

/**
 * Sammanställer räknarna till ett omdöme.
 * @param {{day: string, source: string, calls: number, failures: number}[]} rows Rader för de senaste 30 dygnen.
 * @param {string} today 'YYYY-MM-DD' (UTC, samma som räknarna).
 * @param {{day: string, api: string, n: number}[]} capped Dygnsgränserna i api_calls för i dag.
 * @param {Record<string, number>} dailyLimits Dygnsgränserna per api.
 */
export function evaluateHealth(rows, today, capped = [], dailyLimits = {}) {
  const sources = {};
  for (const r of rows || []) {
    const s = (sources[r.source] ||= { today: { calls: 0, failures: 0 }, last30: { calls: 0, failures: 0 } });
    const calls = Number(r.calls) || 0;
    const failures = Number(r.failures) || 0;
    s.last30.calls += calls;
    s.last30.failures += failures;
    if (r.day === today) {
      s.today.calls += calls;
      s.today.failures += failures;
    }
  }
  const problems = [];
  for (const [name, s] of Object.entries(sources)) {
    const quota = MONTHLY_QUOTAS[name];
    if (quota) {
      s.quota = quota;
      s.quotaUsed = Math.round((s.last30.calls / quota) * 1000) / 1000;
      if (s.quotaUsed >= QUOTA_WARN) {
        problems.push(`${name}: ${Math.round(s.quotaUsed * 100)} % av månadskvoten (${s.last30.calls} av ${quota}) använd de senaste 30 dygnen.`);
      }
    }
    const { calls, failures } = s.today;
    if (calls >= FAILURE_MIN_CALLS && failures / calls >= FAILURE_WARN) {
      problems.push(`${name}: ${failures} av ${calls} anrop i dag misslyckades.`);
    }
  }
  const limits = {};
  for (const r of capped || []) {
    if (r.day !== today) continue;
    const limit = dailyLimits[r.api];
    if (!limit) continue;
    limits[r.api] = { used: Number(r.n) || 0, limit };
    if (Number(r.n) > limit) problems.push(`${r.api}: dygnsgränsen (${limit}) är nådd, sidan visar sparad data.`);
  }
  return { ok: problems.length === 0, problems, sources, dailyLimits: limits };
}
