// Reseplaneraren: vad som helst man skriver, från där man står.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/trafik.js';
import { isoMinutes, mapTrips, pickDestination } from '../lib/plan.mjs';

const leg = (type, from, dep, to, arr, product, extra = {}) => ({
  type,
  Origin: { name: from, time: `${dep}:00`, date: '2026-11-26' },
  Destination: { name: to, time: `${arr}:00`, date: '2026-11-26' },
  ...(product ? { Product: [product] } : {}),
  ...extra,
});
const karlstadTrip = {
  duration: 'PT3H40M',
  LegList: {
    Leg: [
      leg('WALK', 'Herrängens gård', '17:02', 'Herrängens gård', '17:06', null, { duration: 'PT4M', dist: 290 }),
      leg('JNY', 'Herrängens gård', '17:06', 'Fruängen', '17:14', { catCode: 7, catOutL: 'Buss', displayNumber: '144', operator: 'SL' }, { direction: 'Fruängen', duration: 'PT8M' }),
      leg('TRSF', 'Fruängen', '17:14', 'Fruängen', '17:14', null, { duration: 'PT0M' }),
      leg('JNY', 'Fruängen', '17:16', 'T-Centralen', '17:33', { catCode: 5, catOutL: 'Tunnelbana', displayNumber: '14', operator: 'SL' }, { direction: 'Mörby centrum', duration: 'PT17M' }),
      leg('WALK', 'T-Centralen', '17:33', 'Stockholm Centralstation', '17:40', null, { duration: 'PT7M', dist: 350 }),
      leg('JNY', 'Stockholm Centralstation', '17:52', 'Karlstad Centralstation', '20:42', { catCode: 2, catOutL: 'Regionaltåg', displayNumber: '65', operator: 'SJ' }, { direction: 'Karlstad C', duration: 'PT2H50M' }),
    ],
  },
};

test('isoMinutes läser ISO-tider', () => {
  assert.equal(isoMinutes('PT1H25M'), 85);
  assert.equal(isoMinutes('PT7M'), 7);
  assert.equal(isoMinutes(''), 0);
});

test('pickDestination: hållplats eller adress', () => {
  assert.deepEqual(pickDestination({ stopLocationOrCoordLocation: [{ StopLocation: { extId: '740000006', name: 'Karlstad Centralstation' } }] }), {
    kind: 'stop', id: '740000006', name: 'Karlstad Centralstation',
  });
  const a = pickDestination({ stopLocationOrCoordLocation: [{ CoordLocation: { name: 'Drottninggatan 1, Stockholm', lat: 59.33, lon: 18.06 } }] });
  assert.equal(a.kind, 'coord');
  assert.equal(pickDestination({}), null);
});

test('mapTrips: gång, buss, T-bana, gång och regionaltåg; tomma byten försvinner', () => {
  const [trip] = mapTrips({ Trip: [karlstadTrip] });
  assert.equal(trip.dep, '17:02');
  assert.equal(trip.arr, '20:42');
  assert.equal(trip.minutes, 220);
  assert.equal(trip.changes, 2);
  assert.deepEqual(trip.legs.map((l) => (l.kind === 'walk' ? `gå ${l.minutes}` : `${l.mode} ${l.line}`)), [
    'gå 4', 'bus Buss 144', 'subway Tunnelbana 14', 'gå 7', 'train Regionaltåg 65',
  ]);
});

test('action=plan: från en position, till vad man skrev', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('/location.name?input=Karlstad')) {
      return new Response(JSON.stringify({ stopLocationOrCoordLocation: [{ StopLocation: { extId: '740000006', name: 'Karlstad Centralstation' } }] }));
    }
    if (u.includes('/trip?')) return new Response(JSON.stringify({ Trip: [karlstadTrip] }));
    return new Response('{}', { status: 404 });
  };
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=plan', {
      method: 'POST',
      body: JSON.stringify({ to: 'Karlstad', lat: 59.2801, lon: 17.9612 }),
    }),
    env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
    waitUntil() {},
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.fromHere, true);
  assert.equal(body.trips[0].legs.length, 5);
  const trip = urls.find((u) => u.includes('/trip?'));
  assert.ok(trip.includes('originCoordLat=59.28010') && trip.includes('destId=740000006'));
  assert.ok(!urls.some((u) => u.includes('59.2801') && u.includes('alltiditid.se')), 'positionen syns inte i vår adress');
});

test('action=plan kräver POST och en start', async () => {
  const get = await onRequest({ request: new Request('https://alltiditid.se/api/trafik?action=plan'), env: { TRAFIKLAB_RESROBOT_KEY: 'rr' }, waitUntil() {} });
  assert.equal(get.status, 405);
  const none = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=plan', { method: 'POST', body: JSON.stringify({ to: 'Karlstad' }) }),
    env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
    waitUntil() {},
  });
  assert.equal(none.status, 400);
});
