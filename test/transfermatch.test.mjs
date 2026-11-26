// Bytet mot ett mål: filtrera anslutningarna på slutstation eller hållplats på vägen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldPlace, matchConnection, stopsAfter } from '../lib/transferMatch.mjs';
import { onRequest } from '../functions/api/trafik.js';
import { localAt, minuteNow } from './helpers.mjs';

test('foldPlace: versaler, å/ä/ö och skiljetecken spelar ingen roll', () => {
  assert.equal(foldPlace('Fruängen'), 'fruangen');
  assert.equal(foldPlace('  SÖDERTÄLJE-Centrum '), 'sodertalje centrum');
  assert.equal(foldPlace('Kungsträdgården'), foldPlace('kungstradgarden'));
});

test('matchConnection: slutstation, del av namn och hållplats på vägen', () => {
  const red = { destination: 'Fruängen', stopsAfter: ['Gamla stan', 'Slussen', 'Liljeholmen', 'Fruängen'] };
  const green = { destination: 'Alvik', stopsAfter: ['Hötorget', 'Fridhemsplan', 'Alvik'] };
  assert.deepEqual(matchConnection(red, 'fruang'), { hit: true });
  assert.deepEqual(matchConnection(red, 'liljeholm'), { hit: true, via: 'Liljeholmen' });
  assert.deepEqual(matchConnection(green, 'Fruängen'), { hit: false });
  assert.deepEqual(matchConnection({ destination: 'Farsta strand' }, 'farsta'), { hit: true });
  assert.deepEqual(matchConnection(green, '   '), { hit: true }, 'tomt filter visar allt');
});

test('stopsAfter: hållplatserna efter den avgång som matchar tiden', () => {
  const journey = {
    stops: [
      { name: 'Mörby centrum', departure: { scheduled: '14:30' } },
      { name: 'T-Centralen', departure: { scheduled: '14:50' } },
      { name: 'Gamla stan', departure: { scheduled: '14:52' } },
      { name: 'Fruängen', arrival: { scheduled: '15:10' } },
    ],
  };
  assert.deepEqual(stopsAfter(journey, '14:50'), ['Gamla stan', 'Fruängen']);
  assert.equal(stopsAfter(journey, '09:00'), null);
});

test('connections med stops=1: en tur per linje och riktning, hållplatserna läggs på avgångarna', async () => {
  const now = minuteNow();
  const t = (m) => localAt(now, m);
  const dep = (id, des, dir, m) => ({
    scheduled: t(m), realtime: t(m), delay: 0, canceled: false, is_realtime: true,
    route: { name: 'Tunnelbanans röda linje', designation: des, transport_mode: 'METRO', direction: dir },
    trip: { trip_id: id, start_date: t(0).slice(0, 10) }, agency: { name: 'SL' }, stop: { lat: 59.33, lon: 18.06 }, alerts: [],
  });
  const tripCall = (name, m) => ({ stop: { id: name, name }, scheduledDeparture: t(m), realtimeDeparture: t(m), is_realtime: true });
  const tripUrls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/stops/name/')) {
      return new Response(JSON.stringify({ stop_groups: [{ id: '740000759', name: 'Slussen', transport_modes: ['METRO'], stops: [] }] }));
    }
    if (u.includes('/v1/departures/')) {
      return new Response(JSON.stringify({ stops: [{ id: '740000759', name: 'Slussen' }], departures: [
        dep('R1', '14', 'Fruängen', 35), dep('R2', '14', 'Fruängen', 40), dep('G1', '18', 'Farsta strand', 36),
      ] }));
    }
    const m = /\/v1\/trips\/(\w+)\//.exec(u);
    if (m) {
      tripUrls.push(m[1]);
      const calls = m[1] === 'R1'
        ? [tripCall('Slussen', 35), tripCall('Liljeholmen', 39), tripCall('Fruängen', 50)]
        : [tripCall('Slussen', 36), tripCall('Skanstull', 38), tripCall('Farsta strand', 55)];
      return new Response(JSON.stringify({ route: {}, calls }));
    }
    return new Response('{}', { status: 404 });
  };
  const arrival = t(30).slice(0, 16);
  const res = await onRequest({
    request: new Request(`https://alltiditid.se/api/trafik?action=connections&station=Slussen&arrival=${arrival}&stops=1`),
    env: { TRAFIKLAB_REALTIME_API_KEY: 'rt' },
    waitUntil() {},
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.stops, true);
  assert.deepEqual(tripUrls.sort(), ['G1', 'R1'], 'en uppslagning per linje och riktning');
  const byTrip = Object.fromEntries(body.departures.map((d) => [d.tripId, d.stopsAfter]));
  assert.deepEqual(byTrip.R1, ['Liljeholmen', 'Fruängen']);
  assert.deepEqual(byTrip.R2, ['Liljeholmen', 'Fruängen'], 'samma linje delar svaret');
  assert.deepEqual(byTrip.G1, ['Skanstull', 'Farsta strand']);
});
