// "Hinner jag bytet?": anslutningar efter tågets ankomst, med marginal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/trafik.js';
import { localAt, minuteNow } from './helpers.mjs';

const now = minuteNow();
const t = (m) => localAt(now, m);
const call = (id, des, mode, m, extra = {}) => ({
  scheduled: t(m), realtime: t(m), delay: 0, canceled: false, is_realtime: true,
  route: { name: mode === 'TRAIN' ? 'Tåg' : 'Buss', designation: des, transport_mode: mode, direction: 'Mål ' + des },
  trip: { trip_id: id }, agency: { name: 'Östgötatrafiken' }, stop: { lat: 58.41, lon: 15.62 }, alerts: [], ...extra,
});

test('anslutningar räknas från ankomsten, tåget självt utesluts', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('/stops/name/')) {
      return new Response(JSON.stringify({ stop_groups: [
        { id: '740000009', name: 'Linköping Centralstation', average_daily_stop_times: 900, transport_modes: ['TRAIN', 'BUS'], stops: [] },
      ] }));
    }
    if (u.includes('/v1/departures/740000009/')) {
      return new Response(JSON.stringify({ stops: [{ id: '740000009', name: 'Linköping Centralstation' }], departures: [
        call('A', '12', 'BUS', 32),
        call('B', '532', 'TRAIN', 33),
        call('C', '8730', 'TRAIN', 38),
        call('D', '1', 'BUS', 29),
      ] }));
    }
    return new Response('{}', { status: 404 });
  };
  const arrival = t(30).slice(0, 16);
  const res = await onRequest({
    request: new Request(`https://alltiditid.se/api/trafik?action=connections&station=Link%C3%B6ping%20C&arrival=${arrival}&train=532`),
    env: { TRAFIKLAB_REALTIME_API_KEY: 'rt' },
    waitUntil() {},
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(urls.some((u) => u.includes('/stops/name/Link%C3%B6ping%20Centralstation')), 'C blir Centralstation');
  assert.ok(urls.some((u) => u.includes(`/v1/departures/740000009/${encodeURIComponent(arrival)}`)), 'tavlan från ankomsttiden');
  assert.equal(body.transfer, 7, 'stor station: 7 min');
  assert.deepEqual(body.departures.map((d) => [d.line.split(' ').pop(), d.margin]), [['1', -1], ['12', 2], ['8730', 8]]);
});
