// Reseplaneraren: vad som helst man skriver, från där man står.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/trafik.js';
import { agencyName, isoMinutes, mapTrips, pickDestination } from '../lib/plan.mjs';

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

test('action=plan: datum, tid och framme senast går vidare till ResRobot', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('/location.name?')) {
      return new Response(JSON.stringify({ stopLocationOrCoordLocation: [{ StopLocation: { extId: '740000006', name: 'Karlstad Centralstation' } }] }));
    }
    if (u.includes('/trip?')) return new Response(JSON.stringify({ Trip: [karlstadTrip] }));
    return new Response('{}', { status: 404 });
  };
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=plan', {
      method: 'POST',
      body: JSON.stringify({ to: 'Karlstad', fromId: '740021705', date: '2026-11-27', time: '09:00', arrive: true }),
    }),
    env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
    waitUntil() {},
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.arrive, true);
  assert.equal(body.trips[0].arrDate, '2026-11-26');
  const trip = urls.find((u) => u.includes('/trip?'));
  assert.ok(trip.includes('date=2026-11-27') && trip.includes('time=09:00') && trip.includes('searchForArrival=1'));
});

test('action=plan: en gatuadress söks bland adresser först och planeras till koordinaterna', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('/location.name?') && u.includes('type=A')) {
      return new Response(JSON.stringify({ stopLocationOrCoordLocation: [{ CoordLocation: { name: 'Drottninggatan 12, Karlstad', lat: 59.3805, lon: 13.5034 } }] }));
    }
    if (u.includes('/trip?')) return new Response(JSON.stringify({ Trip: [karlstadTrip] }));
    return new Response('{}', { status: 404 });
  };
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=plan', {
      method: 'POST',
      body: JSON.stringify({ to: 'Drottninggatan 12 Karlstad', lat: 59.2801, lon: 17.9612 }),
    }),
    env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
    waitUntil() {},
  });
  assert.equal(res.status, 200);
  const trip = urls.find((u) => u.includes('/trip?'));
  assert.ok(trip.includes('destCoordLat=59.3805') && trip.includes('originCoordLat='), 'från position till adress');
  assert.ok(urls.findIndex((u) => u.includes('type=A')) < urls.findIndex((u) => u.includes('/trip?')));
});

test('namn: SL i stället för Länstrafik, pendeltåg, regionaltåg och expressbuss utan dubbelord', () => {
  const ride = (product) => ({ type: 'JNY', Origin: { name: 'A', time: '08:00:00' }, Destination: { name: 'B', time: '08:10:00' }, Product: [product], duration: 'PT10M' });
  const [trip] = mapTrips({
    Trip: [{ duration: 'PT1H', LegList: { Leg: [
      ride({ catCode: '7', catOutL: 'Länstrafik - Buss', displayNumber: '144', operator: 'SL' }),
      ride({ catCode: '4', catOutL: 'Länstrafik - Tåg', displayNumber: '43', operator: 'SL' }),
      ride({ catCode: '2', catOutL: 'Regional Tåg', displayNumber: '167', operator: 'SJ' }),
      ride({ catCode: '3', catOutL: 'Expressbuss', displayNumber: 'Buss 814', operator: 'Värmlandstrafik' }),
      ride({ catCode: '7', catOutL: 'Länstrafik - Buss', displayNumber: '1', operatorInfo: { name: 'Västtrafik' } }),
      ride({ catCode: '3', catOutL: 'Expressbuss Buss', displayNumber: '814' }),
    ] } }],
  });
  assert.deepEqual(trip.legs.map((l) => `${l.agency} ${l.line}`), [
    'SL Buss 144', 'SL Pendeltåg 43', 'SJ Regionaltåg 167', 'Värmlandstrafik Expressbuss 814', 'Västtrafik Buss 1', ' Expressbuss 814',
  ]);
  assert.equal(agencyName('Storstockholms Lokaltrafik'), 'SL');
});

test('byte (TRSF): bytestiden, inte en gångtid', () => {
  const [trip] = mapTrips({ Trip: [{ duration: 'PT1H', LegList: { Leg: [
    leg('JNY', 'Fruängen', '08:43', 'T-Centralen', '09:02', { catCode: 5, catOutL: 'Tunnelbana', displayNumber: '14' }, { duration: 'PT19M' }),
    leg('TRSF', 'T-Centralen', '09:02', 'Stockholm Centralstation', '09:22', null, { duration: 'PT20M', dist: 100 }),
    leg('JNY', 'Stockholm Centralstation', '09:22', 'Sundsvall Centralstation', '12:56', { catCode: 1, catOutL: 'Snabbtåg', displayNumber: '566' }, { duration: 'PT3H34M' }),
  ] } }] });
  const change = trip.legs[1];
  assert.equal(change.transfer, true);
  assert.equal(change.minutes, 20);
  assert.equal(trip.legs[0].kind, 'ride');
});

import { trafficForCounty } from '../lib/countyTraffic.mjs';
test('länets trafikbolag från länsnamn', () => {
  assert.equal(trafficForCounty('Dalarnas län')?.name, 'Dalatrafik');
  assert.equal(trafficForCounty('Västra Götalands län')?.name, 'Västtrafik');
  assert.equal(trafficForCounty('Västmanlands län')?.name, 'VL');
  assert.equal(trafficForCounty('Västernorrlands län')?.name, 'Din Tur');
  assert.equal(trafficForCounty('Stockholms län')?.name, 'SL');
  assert.equal(trafficForCounty('Örebro län')?.name, 'Länstrafiken Örebro');
  assert.equal(trafficForCounty(''), null);
});

test('mapTrips: väntan i gångsträckan visas som väntan, inte gångtid', () => {
  const [trip] = mapTrips({
    Trip: [
      {
        duration: 'PT40M',
        LegList: {
          Leg: [
            leg('JNY', 'Liseberg', '15:00', 'Korsvägen', '15:02', { catCode: 6, catOutL: 'Spårvagn', displayNumber: '5', operator: 'Västtrafik' }, { duration: 'PT2M' }),
            leg('WALK', 'Korsvägen', '15:02', 'Korsvägen läge B', '15:17', null, { duration: 'PT15M', dist: 112 }),
            leg('JNY', 'Korsvägen läge B', '15:17', 'Mölndal', '15:30', { catCode: 7, catOutL: 'Buss', displayNumber: '752', operator: 'Västtrafik' }, { duration: 'PT13M' }),
            leg('WALK', 'Mölndal', '15:30', 'Hem', '15:40', null, { duration: 'PT10M', dist: 100 }),
          ],
        },
      },
    ],
  });
  const walks = trip.legs.filter((l) => l.kind === 'walk');
  assert.equal(walks[0].minutes, 2);
  assert.equal(walks[0].wait, 13);
  // Sista sträckan: ingen avgång att vänta på.
  assert.equal(walks[1].wait, undefined);
});
