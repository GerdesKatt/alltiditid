import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/api/trafik.js';
import { evaluateHealth, isFailure, MONTHLY_QUOTAS, sourceOf } from '../lib/health.mjs';

/** En liten D1 ovanpå SQLite i minnet, med de metoder API:t använder. */
function d1() {
  const db = new DatabaseSync(':memory:');
  const statement = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => statement(sql, a),
    run: async () => db.prepare(sql).run(...args),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return {
    raw: db,
    prepare: (sql) => statement(sql),
    batch: async (stmts) => stmts.map((s) => db.prepare(s.sql).run(...s.args)),
  };
}

const today = () => new Date().toISOString().slice(0, 10);

test('källan räknas efter värdnamn', () => {
  assert.equal(sourceOf('https://realtime-api.trafiklab.se/v1/departures/1?key=x'), 'trafiklab-realtime');
  assert.equal(sourceOf('https://api.resrobot.se/v2.1/location.name?x'), 'resrobot');
  assert.equal(sourceOf('https://photon.komoot.io/api/?q=a'), 'photon.komoot.io');
  assert.equal(sourceOf('inte en adress'), 'okänd');
});

test('404 är inget fel, 429 och 500 är det', () => {
  assert.equal(isFailure(200), false);
  assert.equal(isFailure(404), false);
  assert.equal(isFailure(429), true);
  assert.equal(isFailure(500), true);
  assert.equal(isFailure(401), true);
});

test('allt lugnt ger ok', () => {
  const h = evaluateHealth([{ day: '2026-11-27', source: 'trafiklab-realtime', calls: 500, failures: 3 }], '2026-11-27');
  assert.equal(h.ok, true);
  assert.equal(h.sources['trafiklab-realtime'].today.calls, 500);
  assert.equal(h.sources['trafiklab-realtime'].quota, MONTHLY_QUOTAS['trafiklab-realtime']);
});

test('många fel i dag larmar, men inte vid få anrop', () => {
  const many = evaluateHealth([{ day: 'D', source: 'resrobot', calls: 40, failures: 20 }], 'D');
  assert.equal(many.ok, false);
  assert.match(many.problems[0], /resrobot: 20 av 40/);
  const few = evaluateHealth([{ day: 'D', source: 'resrobot', calls: 5, failures: 5 }], 'D');
  assert.equal(few.ok, true);
  const yesterday = evaluateHealth([{ day: 'C', source: 'resrobot', calls: 40, failures: 40 }], 'D');
  assert.equal(yesterday.ok, true);
});

test('80 % av månadskvoten larmar', () => {
  const quota = MONTHLY_QUOTAS['trafiklab-realtime'];
  const rows = [
    { day: 'C', source: 'trafiklab-realtime', calls: quota * 0.5, failures: 0 },
    { day: 'D', source: 'trafiklab-realtime', calls: quota * 0.3, failures: 0 },
  ];
  const h = evaluateHealth(rows, 'D');
  assert.equal(h.ok, false);
  assert.match(h.problems[0], /80 % av månadskvoten/);
});

test('nådd dygnsgräns larmar', () => {
  const h = evaluateHealth([], 'D', [{ day: 'D', api: 'swedavia-flightinfo', n: 151 }], { 'swedavia-flightinfo': 150 });
  assert.equal(h.ok, false);
  assert.match(h.problems[0], /swedavia-flightinfo: dygnsgränsen \(150\)/);
  const under = evaluateHealth([], 'D', [{ day: 'D', api: 'swedavia-flightinfo', n: 150 }], { 'swedavia-flightinfo': 150 });
  assert.equal(under.ok, true);
});

test('hälsokontrollen utan D1 svarar 503', async () => {
  const res = await onRequest({ request: new Request('https://alltiditid.se/api/trafik?action=health'), env: {}, waitUntil() {} });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).ok, false);
});

test('externa anrop räknas i D1 och syns i hälsokontrollen', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => (globalThis.fetch = realFetch));
  let status = 200;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ departures: [], stops: [{ id: '740021705', name: 'Gullmarsplan' }] }), { status });
  const db = d1();
  const env = { HISTORY: db, TRAFIKLAB_REALTIME_API_KEY: 'k' };
  const pending = [];
  const call = (qs) =>
    onRequest({ request: new Request(`https://alltiditid.se/api/trafik?${qs}`), env, waitUntil: (p) => pending.push(p) });

  await call('stopId=740021705&direction=departures&mode=bus');
  status = 500;
  await call('stopId=740021705&direction=departures&mode=tram');
  await Promise.all(pending);

  const rows = db.raw.prepare('SELECT source, calls, failures FROM upstream_calls WHERE day = ?').all(today());
  const rt = rows.find((r) => r.source === 'trafiklab-realtime');
  assert.ok(rt, 'Trafiklab-anropen räknades');
  assert.ok(rt.calls >= 2);
  assert.ok(rt.failures >= 1);

  const res = await call('action=health');
  const body = await res.json();
  assert.equal(body.sources['trafiklab-realtime'].today.calls, rt.calls);
  assert.equal(res.status, body.ok ? 200 : 503);
});
