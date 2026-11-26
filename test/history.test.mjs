// Förseningshistorik (färdplanen, steg 2): vilka turer som sparas och hur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/trafik.js';
import { historyRows } from '../lib/history.mjs';
import { localAt, minuteNow } from './helpers.mjs';

const now = minuteNow();
const t = (m) => localAt(now, m);

test('bara turer som går nu sparas, med försening och status', () => {
  const nowLocal = t(0).slice(0, 16);
  const rows = historyRows({
    stopId: '740021705',
    stopName: 'Gullmarsplan',
    source: 'trafiklab-realtime',
    nowLocal,
    seenAt: 'x',
    departures: [
      { line: 'Buss 160', destination: 'Årstaberg', _scheduledLocal: t(-4).slice(0, 16), expectedAt: t(1).slice(0, 16), status: 'delayed', delayMinutes: 5, hasRealtime: true },
      { line: 'Buss 144', destination: 'Gullmarsplan', _scheduledLocal: t(1).slice(0, 16), expectedAt: t(1).slice(0, 16), status: 'on-time', hasRealtime: false },
      { line: 'Tunnelbana 17', destination: 'Skarpnäck', _scheduledLocal: t(-2).slice(0, 16), status: 'cancelled' },
      { line: 'Buss 807', destination: 'Gubbängen', _scheduledLocal: t(12).slice(0, 16), expectedAt: t(12).slice(0, 16), status: 'on-time' },
      { line: 'Buss 4', destination: 'Radiohuset', _scheduledLocal: t(-10).slice(0, 16), expectedAt: t(-10).slice(0, 16), status: 'on-time' },
    ],
  });
  assert.deepEqual(rows.map((r) => [r.line, r.delay_min, r.status, r.has_realtime, r.expected_at === null]), [
    ['Buss 160', 5, 'delayed', 1, false],
    ['Buss 144', 0, 'on-time', 0, false],
    ['Tunnelbana 17', 0, 'cancelled', null, true],
  ]);
  assert.equal(rows[0].trip_key, `740021705|Buss 160|Årstaberg|${t(-4).slice(0, 16)}`);
});

test('tavlan sparar i D1 efter svaret, och fungerar utan D1', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('realtime-api.trafiklab.se/v1/departures/')) {
      return new Response(JSON.stringify({ stops: [{ id: '740000001', name: 'Uppsala C' }], departures: [
        { scheduled: t(1) + '', realtime: t(1), delay: 0, canceled: false, is_realtime: true,
          route: { name: 'Buss', designation: '3', transport_mode: 'BUS', direction: 'Mål' },
          trip: { trip_id: 'A' }, agency: { name: 'UL' }, stop: { lat: 59.85, lon: 17.64 }, alerts: [] },
        { scheduled: t(30), realtime: t(30), delay: 0, canceled: false, is_realtime: true,
          route: { name: 'Buss', designation: '5', transport_mode: 'BUS', direction: 'Mål' },
          trip: { trip_id: 'B' }, agency: { name: 'UL' }, stop: { lat: 59.85, lon: 17.64 }, alerts: [] },
      ] }));
    }
    return new Response('{}', { status: 404 });
  };
  const bound = [];
  const db = {
    prepare: (sql) => ({ sql, bind: (...args) => ({ sql, args }) }),
    batch: async (stmts) => {
      for (const s of stmts) if (s.args) bound.push(s.args);
      return [];
    },
  };
  const pending = [];
  const qs = 'action=departures&stopId=740000005&stopName=Uppsala%20C&mode=all&direction=departures';
  const res = await onRequest({
    request: new Request(`https://alltiditid.se/api/trafik?${qs}`),
    env: { TRAFIKLAB_REALTIME_API_KEY: 'rt', HISTORY: db },
    waitUntil: (p) => pending.push(p),
  });
  assert.equal(res.status, 200);
  await Promise.all(pending);
  assert.equal(bound.length, 1, 'bara bussen som går nu');
  assert.equal(bound[0][1], '740000005');
  assert.equal(bound[0][3], 'Buss 3');

  const without = await onRequest({
    request: new Request(`https://alltiditid.se/api/trafik?${qs}&x=1`),
    env: { TRAFIKLAB_REALTIME_API_KEY: 'rt' },
    waitUntil() {},
  });
  assert.equal(without.status, 200);
});
