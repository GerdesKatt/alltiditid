// Förseningshistorik i Cloudflare D1 (färdplanen, steg 2).
//
// Varje tur sparas en gång per hållplats med planerad tid, förväntad tid, försening
// och status. Grunden för förseningsersättning (steg 4) och för att kontrollera att
// tavlan visar rätt. Bara avgångar sparas, och bara när de är nära att gå, så att
// den sista prognosen ligger närmast verkligheten och antalet skrivningar hålls nere.
//
// Cloudflare D1:s gratisnivå begränsar antalet skrivna rader per dag. Därför:
// - bara hämtningar som inte kom från cachen sparar (tavlan cachas i 20 s),
// - bara turer som går inom några minuter (fönstret nedan),
// - en rad skrivs om bara när något faktiskt ändrats (WHERE i ON CONFLICT).
//
// Kräver en D1-bindning med namnet HISTORY i Pages-projektet. Saknas den sparas
// ingenting och tavlan fungerar som vanligt.

/** Turer som enligt prognosen går mellan 3 min sedan och 2 min framåt sparas. */
export const WINDOW_BEFORE_MIN = 3;
export const WINDOW_AFTER_MIN = 2;
/** Högst så här många rader per hämtning, som skydd mot ovanligt stora tavlor. */
const MAX_ROWS_PER_BOARD = 40;

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS departures (
    trip_key TEXT PRIMARY KEY,
    stop_id TEXT NOT NULL,
    stop_name TEXT,
    line TEXT NOT NULL,
    destination TEXT,
    mode TEXT,
    operator TEXT,
    train_number TEXT,
    scheduled_at TEXT NOT NULL,
    expected_at TEXT,
    delay_min INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    has_realtime INTEGER,
    source TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS departures_stop_time ON departures (stop_id, scheduled_at)',
  'CREATE INDEX IF NOT EXISTS departures_line_time ON departures (line, scheduled_at)',
];

function localMs(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}

/**
 * Raderna som ska sparas för en tavla. `departures` är färdiga avgångar (efter
 * finalizeTiming) med `_scheduledLocal` kvar. `nowLocal` är svensk tid 'YYYY-MM-DDTHH:MM'.
 */
export function historyRows({ stopId, stopName, source, departures, nowLocal, seenAt }) {
  const now = localMs(nowLocal);
  if (Number.isNaN(now)) return [];
  const rows = [];
  for (const d of departures) {
    const scheduledAt = String(d._scheduledLocal || '').slice(0, 16);
    if (!scheduledAt || !d.line) continue;
    const cancelled = d.status === 'cancelled';
    const ref = localMs(cancelled ? scheduledAt : d.expectedAt || scheduledAt);
    if (Number.isNaN(ref)) continue;
    const diffMin = (ref - now) / 60000;
    if (diffMin < -WINDOW_BEFORE_MIN || diffMin > WINDOW_AFTER_MIN) continue;
    rows.push({
      trip_key: [stopId, d.line, d.destination || '', scheduledAt].join('|'),
      stop_id: stopId,
      stop_name: stopName || null,
      line: d.line,
      destination: d.destination || null,
      mode: d.transportMode || null,
      operator: d.operator || null,
      train_number: d.trainNumber || null,
      scheduled_at: scheduledAt,
      expected_at: cancelled ? null : (d.expectedAt || scheduledAt),
      delay_min: d.status === 'delayed' ? d.delayMinutes || 0 : 0,
      status: d.status || 'on-time',
      has_realtime: d.hasRealtime === true ? 1 : d.hasRealtime === false ? 0 : null,
      source: source || null,
      first_seen: seenAt,
      last_seen: seenAt,
    });
    if (rows.length >= MAX_ROWS_PER_BOARD) break;
  }
  return rows;
}

const UPSERT = `INSERT INTO departures (
    trip_key, stop_id, stop_name, line, destination, mode, operator, train_number,
    scheduled_at, expected_at, delay_min, status, has_realtime, source, first_seen, last_seen
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
  ON CONFLICT (trip_key) DO UPDATE SET
    expected_at = excluded.expected_at,
    delay_min = excluded.delay_min,
    status = excluded.status,
    has_realtime = excluded.has_realtime,
    last_seen = excluded.last_seen
  WHERE departures.expected_at IS NOT excluded.expected_at
     OR departures.status IS NOT excluded.status
     OR departures.has_realtime IS NOT excluded.has_realtime`;

let schemaReady = false;

/** Sparar raderna. Fel sväljs: historiken får aldrig störa tavlan. */
export async function saveHistory(db, rows) {
  if (!db || rows.length === 0) return 0;
  try {
    if (!schemaReady) {
      await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
      schemaReady = true;
    }
    const stmt = db.prepare(UPSERT);
    await db.batch(
      rows.map((r) =>
        stmt.bind(
          r.trip_key, r.stop_id, r.stop_name, r.line, r.destination, r.mode, r.operator, r.train_number,
          r.scheduled_at, r.expected_at, r.delay_min, r.status, r.has_realtime, r.source, r.first_seen, r.last_seen
        )
      )
    );
    return rows.length;
  } catch {
    return 0;
  }
}
