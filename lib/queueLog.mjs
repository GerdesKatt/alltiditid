// Köhistorik i Cloudflare D1 (bindningen HISTORY), underlag för prognosen i
// lib/queueForecast.mjs.
//
// queue_log:   en rad per kö och färsk hämtning från Swedavia (var 5:e minut som
//              tätast, och var 30:e minut från schemat i .github/workflows/koer.yml).
//              Några hundra rader per dygn, långt under D1:s gratisnivå.
// dep_counts:  antal avgångar per flygplats, datum och timme, skrivs om vid varje
//              färsk flygtavla så att inställda och nya flyg räknas in.
//
// Vi sparar bara Swedavias siffror (kö, terminal, minuter, tid) och inget om besökarna.
// Saknas D1 eller svarar den inte sparas ingenting och tavlan fungerar som vanligt.

export const QUEUE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS queue_log (
    airport TEXT NOT NULL,
    queue TEXT NOT NULL,
    fast_track INTEGER NOT NULL DEFAULT 0,
    terminal TEXT,
    at TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    PRIMARY KEY (airport, queue, fast_track, at)
  )`,
  `CREATE TABLE IF NOT EXISTS dep_counts (
    airport TEXT NOT NULL,
    day TEXT NOT NULL,
    hour INTEGER NOT NULL,
    n INTEGER NOT NULL,
    PRIMARY KEY (airport, day, hour)
  )`,
];

let schemaReady = false;

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(QUEUE_SCHEMA.map((sql) => db.prepare(sql)));
  schemaReady = true;
}

/** Sparar en hämtning av kötiderna. `at` är svensk tid, YYYY-MM-DDTHH:MM. */
export async function logQueues(db, airport, queues, at) {
  if (!db || !queues.length || !at) return 0;
  try {
    await ensureSchema(db);
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO queue_log (airport, queue, fast_track, terminal, at, minutes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
    );
    await db.batch(
      queues.map((q) => stmt.bind(airport, q.name, q.fastTrack ? 1 : 0, q.terminal || null, at, Math.round(q.minutes)))
    );
    return queues.length;
  } catch {
    return 0;
  }
}

/** Sparar avgångar per timme för ett datum (ersätter tidigare siffror för de timmarna). */
export async function logDepartures(db, airport, day, counts) {
  if (!db || !counts.length) return 0;
  try {
    await ensureSchema(db);
    const stmt = db.prepare(
      'INSERT INTO dep_counts (airport, day, hour, n) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (airport, day, hour) DO UPDATE SET n = excluded.n WHERE n != excluded.n'
    );
    await db.batch(counts.map((c) => stmt.bind(airport, day, c.hour, c.n)));
    return counts.length;
  } catch {
    return 0;
  }
}

/** Kötider sammanställda per kö, datum och timme sedan ett datum. */
export async function queueRows(db, airport, sinceDay) {
  if (!db) return [];
  try {
    await ensureSchema(db);
    const res = await db
      .prepare(
        `SELECT queue, fast_track, substr(at, 1, 10) AS day, CAST(substr(at, 12, 2) AS INTEGER) AS hour, AVG(minutes) AS minutes
         FROM queue_log WHERE airport = ?1 AND at >= ?2
         GROUP BY queue, fast_track, day, hour`
      )
      .bind(airport, sinceDay)
      .all();
    return (res && res.results) || [];
  } catch {
    return [];
  }
}

/** Avgångar per timme sedan ett datum, till och med ett annat. */
export async function departureRows(db, airport, sinceDay, untilDay) {
  if (!db) return [];
  try {
    await ensureSchema(db);
    const res = await db
      .prepare('SELECT day, hour, n FROM dep_counts WHERE airport = ?1 AND day >= ?2 AND day <= ?3')
      .bind(airport, sinceDay, untilDay)
      .all();
    return (res && res.results) || [];
  } catch {
    return [];
  }
}

/** Senast sparade kötider efter en tidpunkt, för när dygnets anrop är slut. */
export async function latestQueues(db, airport, sinceAt) {
  if (!db) return [];
  try {
    await ensureSchema(db);
    const res = await db
      .prepare(
        `SELECT queue AS name, fast_track, terminal, at, minutes FROM queue_log
         WHERE airport = ?1 AND at = (SELECT MAX(at) FROM queue_log WHERE airport = ?1 AND at >= ?2)`
      )
      .bind(airport, sinceAt)
      .all();
    return ((res && res.results) || []).map((r) => ({
      name: r.name,
      terminal: r.terminal || '',
      minutes: Number(r.minutes),
      fastTrack: Boolean(r.fast_track),
      at: r.at,
    }));
  } catch {
    return [];
  }
}
