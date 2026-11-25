// Västtrafik: realtid ovanpå Trafiklab, "går inte hela vägen" och flera sidor (A4, A5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { board, localAt, minuteNow } from './helpers.mjs';

const now = minuteNow();
const t = (m) => localAt(now, m);
const iso = (m) => new Date(now.getTime() + m * 60000).toISOString();
const stop = { lat: 57.7069, lon: 11.9681 };
const vtCall = (id, des, mode, m, dir) => ({
  scheduled: t(m), realtime: t(m), delay: 0, canceled: false, is_realtime: false,
  route: { name: null, designation: des, transport_mode: mode, direction: dir },
  trip: { trip_id: id }, agency: { name: 'Västtrafik' }, stop, alerts: [],
});

function mockFetch({ total = 4 } = {}) {
  const seen = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('realtime-api.trafiklab.se/v1/departures/')) {
      return new Response(JSON.stringify({ stops: [{ id: '740020752', name: 'Göteborg Brunnsparken' }], departures: [
        vtCall('V1', '6', 'TRAM', 4, 'Kortedala'),
        vtCall('V2', '16', 'BUS', 6, 'Eketrägatan'),
        vtCall('V3', '11', 'TRAM', 7, 'Saltholmen'),
        vtCall('V4', '5', 'TRAM', 9, 'Torp'),
      ] }));
    }
    if (u === 'https://ext-api.vasttrafik.se/token') return new Response(JSON.stringify({ access_token: 'TOK', expires_in: 86400 }));
    if (u.includes('/locations/by-text')) {
      return new Response(JSON.stringify({ results: [
        { gid: '9021014001200000', name: 'Brunnsparken, Göteborg', locationType: 'stoparea', latitude: 57.7069, longitude: 11.9682 },
      ] }));
    }
    if (u.includes('/stop-areas/')) {
      seen.push(u.split('?')[1]);
      const offset = Number(new URL(u).searchParams.get('offset') || 0);
      const base = [
        { plannedTime: iso(4), estimatedTime: iso(7), serviceJourney: { line: { shortName: '6' } }, stopPoint: { platform: 'D' } },
        { plannedTime: iso(6), estimatedTime: iso(6), isPartCancelled: true, serviceJourney: { line: { shortName: '16' } }, stopPoint: { platform: { name: 'B' } } },
        { plannedTime: iso(7), isCancelled: true, serviceJourney: { line: { shortName: '11' } } },
      ];
      if (total <= 100) return new Response(JSON.stringify({ results: base }));
      // Många avgångar: linje 5 finns först på sida 3.
      const n = Math.max(0, Math.min(100, total - offset));
      const results = Array.from({ length: n }, (_, i) => ({ plannedTime: iso(40 + i), serviceJourney: { line: { shortName: 'P' + (offset + i) } } }));
      if (offset === 200) results[n - 1] = { plannedTime: iso(9), estimatedTime: iso(13), serviceJourney: { line: { shortName: '5' } } };
      return new Response(JSON.stringify({ results }));
    }
    throw new Error('oväntat anrop ' + u);
  };
  return seen;
}

const env = { TRAFIKLAB_REALTIME_API_KEY: 'rt', VASTTRAFIK_KEY: 'K', VASTTRAFIK_SECRET: 'S' };
const qs = (x) => `action=departures&stopId=740020752&stopName=Brunnsparken&direction=departures&x=${x}`;
const byLine = (list, line) => list.find((d) => d.line.endsWith(` ${line}`));

test('realtid, inställd och "går inte hela vägen" från Västtrafik', async () => {
  mockFetch();
  const { body } = await board(qs(1), env);
  const list = body.departures;
  assert.equal(byLine(list, '6').status, 'delayed');
  assert.equal(byLine(list, '6').delayMinutes, 3);
  assert.equal(byLine(list, '16').deviation, 'Går inte hela vägen');
  assert.equal(byLine(list, '11').status, 'cancelled');
  assert.equal(byLine(list, '5').hasRealtime, false);
});

test('stora hållplatser: upp till tre sidor hämtas', async () => {
  const seen = mockFetch({ total: 250 });
  const { body } = await board(qs(2), env);
  assert.equal(seen.length, 3);
  assert.match(seen[2], /offset=200/);
  assert.equal(byLine(body.departures, '5').delayMinutes, 4);
});
