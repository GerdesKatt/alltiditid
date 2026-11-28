// SL Transport API: realtid för SL-avgångar som saknar den hos Trafiklab (A3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { board, localAt, minuteNow } from './helpers.mjs';

const now = minuteNow();
const t = (m, s = 0) => localAt(now, m, s);
const coords = { lat: 59.2989, lon: 18.0810 };
const tl = (id, des, mode, m, extra = {}) => ({
  scheduled: t(m), realtime: t(m), delay: 0, canceled: false, is_realtime: false,
  route: { name: mode === 'BUS' ? 'Buss' : 'Gröna linjen', designation: des, transport_mode: mode, direction: 'Mål ' + des },
  trip: { trip_id: id }, agency: { name: 'SL', operator: 'Keolis' }, stop: coords, alerts: [], ...extra,
});
const sl = (des, m, expectedM, display, extra = {}) => ({
  destination: 'Mål ' + des, display, scheduled: t(m), expected: t(expectedM),
  line: { designation: des, transport_mode: 'BUS' }, state: 'EXPECTED', stop_point: { designation: 'J' }, ...extra,
});

function mockFetch() {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('realtime-api.trafiklab.se/v1/departures/')) {
      return new Response(JSON.stringify({ stops: [{ id: '740021705', name: 'Gullmarsplan' }], departures: [
        tl('A', '160', 'BUS', 5),
        tl('B', '144', 'BUS', 6),
        tl('C', '875', 'BUS', 8),
        tl('D', '19', 'METRO', 9, { is_realtime: true, realtime: t(9) }),
        tl('E', '807', 'BUS', 40),
      ] }));
    }
    if (u.endsWith('/v1/sites')) {
      return new Response(JSON.stringify([
        { id: 9189, name: 'Gullmarsplan', lat: 59.2984, lon: 18.0809 },
        { id: 1234, name: 'Johanneshov', lat: 59.2990, lon: 18.0815 },
        { id: 9001, name: 'T-Centralen', lat: 59.3313, lon: 18.0604 },
      ]));
    }
    if (u.includes('/v1/sites/9189/departures')) {
      return new Response(JSON.stringify({ departures: [
        sl('160', 5, 8, '3 min'), // 3 min sen
        sl('144', 6, 6, 'Nu'), // i tid, med realtid
        sl('875', 8, 8, '', { state: 'CANCELLED' }), // inställd
        sl('807', 40, 40, t(40).slice(11, 16)), // klockslag = ingen prognos
      ] }));
    }
    return new Response('{}', { status: 404 });
  };
  return calls;
}

const env = { TRAFIKLAB_REALTIME_API_KEY: 'rt' };
const byLine = (list, line) => list.find((d) => d.line.endsWith(` ${line}`));

test('SL:s prognos fyller i realtid som Trafiklab saknar', async () => {
  const calls = mockFetch();
  const { body } = await board('action=departures&stopId=740021705&stopName=Gullmarsplan&mode=all&direction=departures', env);
  const list = body.departures;
  assert.ok(calls.some((c) => c.includes('/v1/sites/9189/departures')), 'rätt SL-site (samma namn vinner)');
  assert.equal(byLine(list, '160').status, 'delayed');
  assert.equal(byLine(list, '160').delayMinutes, 3);
  assert.equal(byLine(list, '160').newTime, t(8).slice(11, 16));
  assert.equal(byLine(list, '160').expectedAt, t(8).slice(0, 16));
  assert.equal(byLine(list, '144').hasRealtime, true);
  assert.equal(byLine(list, '875').status, 'cancelled');
  assert.equal(byLine(list, '807').hasRealtime, false);
  assert.equal(byLine(list, '19').hasRealtime, true);
});

test('ankomster frågar inte SL', async () => {
  const calls = mockFetch();
  await board('action=departures&stopId=740021705&stopName=Gullmarsplan&mode=all&direction=arrivals&x=2', env);
  assert.ok(!calls.some((c) => c.includes('transport.integration.sl.se')));
});

test('SL-svaret delas i 25 s per site, och efter 429 används det senaste svaret', async () => {
  const { slUpdatesCached, resetSlShared } = await import('../functions/api/trafik.js');
  resetSlShared();
  let calls = 0;
  const ok = async () => { calls++; return new Map([['x', calls]]); };
  const t0 = 1_000_000;
  const [a, b] = await Promise.all([slUpdatesCached('s1', ok, t0), slUpdatesCached('s1', ok, t0 + 10)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await slUpdatesCached('s1', ok, t0 + 20_000);
  assert.equal(calls, 1);
  const busy = async () => { calls++; throw new Error('SL departures 429'); };
  const stale = await slUpdatesCached('s1', busy, t0 + 30_000);
  assert.equal(stale, a);
  assert.equal(calls, 2);
  // Siten vilar i 30 s: inget nytt anrop.
  assert.equal(await slUpdatesCached('s1', ok, t0 + 40_000), a);
  assert.equal(calls, 2);
  resetSlShared();
});
