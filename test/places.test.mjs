// "Vart ska du?": platser, hotell och adresser, och man behöver inte skriva helt rätt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/trafik.js';
import { geoapifyPlaces, photonPlaces, placeScore, rankPlaces } from '../lib/places.mjs';

test('placeScore: felstavat, utan prickar, delar av ord och omvänd ordning', () => {
  assert.ok(placeScore('Clarion sign', 'Clarion Hotel Sign') >= 0.9);
  assert.equal(placeScore('Clarion sign', 'Sigtuna busstation'), 0);
  assert.ok(placeScore('gulmarsplan', 'Gullmarsplan') >= 0.7, 'en bokstav fel');
  assert.ok(placeScore('liljehomen', 'Liljeholmen') >= 0.7, 'en bokstav saknas');
  assert.equal(placeScore('fruangen', 'Fruängen'), 1);
  assert.equal(placeScore('sodersjukhuset', 'Södersjukhuset'), 1);
  assert.ok(placeScore('tcentralen', 'T-Centralen') >= 0.9, 'ihopskrivet');
  assert.ok(placeScore('sign clarion', 'Clarion Hotel Sign') >= 0.8, 'ordningen spelar ingen roll');
  assert.ok(placeScore('karolinska', 'Karolinska Universitetssjukhuset') >= 0.8, 'början av namnet');
  assert.ok(placeScore('scandic', 'Scandic Continental', 'Vasagatan 22, Stockholm') > 0);
  assert.ok(placeScore('scandic stockholm', 'Scandic Continental', 'Vasagatan 22, Stockholm') > 0, 'orten räknas');
  assert.equal(placeScore('ab', 'Odenplan'), 0, 'korta ord måste stämma');
});

test('rankPlaces: bäst passande först, hållplats före plats när de passar lika bra, inga dubbletter', () => {
  const list = [
    { kind: 'stop', id: '740001234', name: 'Sigtuna busstation' },
    { kind: 'poi', name: 'Clarion Hotel Sign', detail: 'Östra Järnvägsgatan 35, Stockholm', lat: 59.3363, lon: 18.0563 },
    { kind: 'poi', name: 'Odenplan', lat: 59.343, lon: 18.049 },
    { kind: 'stop', id: '740001618', name: 'Odenplan' },
    { kind: 'stop', id: '740001618', name: 'Odenplan' },
  ];
  assert.equal(rankPlaces('clarion sign', list)[0].name, 'Clarion Hotel Sign');
  assert.equal(rankPlaces('clarion sign', list).length, 1, 'Sigtuna passar inte');
  const oden = rankPlaces('odenplan', list);
  assert.equal(oden[0].kind, 'stop');
  assert.equal(oden.length, 1);
});

test('photonPlaces: hotell som plats, hus som adress, hållplatser och utlandet bort', () => {
  const places = photonPlaces({
    features: [
      { geometry: { coordinates: [18.0563, 59.3363] }, properties: { name: 'Clarion Hotel Sign', osm_key: 'tourism', osm_value: 'hotel', street: 'Östra Järnvägsgatan', housenumber: '35', city: 'Stockholm', countrycode: 'SE', type: 'house' } },
      { geometry: { coordinates: [18.06, 59.33] }, properties: { street: 'Drottninggatan', housenumber: '12', city: 'Stockholm', countrycode: 'SE', type: 'house', osm_key: 'place', osm_value: 'house' } },
      { geometry: { coordinates: [18.05, 59.34] }, properties: { name: 'Odenplan', osm_key: 'public_transport', osm_value: 'stop_position', countrycode: 'SE' } },
      { geometry: { coordinates: [10.7, 59.9] }, properties: { name: 'Clarion Hotel Oslo', osm_key: 'tourism', osm_value: 'hotel', countrycode: 'NO' } },
    ],
  });
  assert.equal(places.length, 2);
  assert.deepEqual(places[0], { kind: 'poi', name: 'Clarion Hotel Sign', detail: 'Östra Järnvägsgatan 35, Stockholm', type: 'hotel', lat: 59.3363, lon: 18.0563 });
  assert.equal(places[1].kind, 'address');
  assert.equal(places[1].name, 'Drottninggatan 12');
});

test('geoapifyPlaces: plats och adress', () => {
  const places = geoapifyPlaces({
    results: [
      { name: 'Clarion Hotel Sign', result_type: 'amenity', category: 'accommodation.hotel', street: 'Östra Järnvägsgatan', housenumber: '35', city: 'Stockholm', country_code: 'se', lat: 59.3363, lon: 18.0563 },
      { result_type: 'building', address_line1: 'Drottninggatan 12', city: 'Stockholm', country_code: 'se', lat: 59.33, lon: 18.06 },
    ],
  });
  assert.equal(places[0].kind, 'poi');
  assert.equal(places[0].type, 'hotel');
  assert.equal(places[1].kind, 'address');
});

const trip = {
  duration: 'PT25M',
  LegList: { Leg: [{ type: 'JNY', Origin: { name: 'A', time: '08:00:00' }, Destination: { name: 'B', time: '08:25:00' }, Product: [{ catCode: 5, catOutL: 'Tunnelbana', displayNumber: '14' }], duration: 'PT25M' }] },
};

test('action=plan: "Clarion sign" blir hotellet, inte Sigtuna busstation', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('/location.name?')) {
      return new Response(JSON.stringify({ stopLocationOrCoordLocation: [{ StopLocation: { extId: '740000321', name: 'Sigtuna busstation', lat: 59.61, lon: 17.72 } }] }));
    }
    if (u.includes('photon')) {
      return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [18.0563, 59.3363] }, properties: { name: 'Clarion Hotel Sign', osm_key: 'tourism', osm_value: 'hotel', city: 'Stockholm', countrycode: 'SE' } }] }));
    }
    if (u.includes('/trip?')) return new Response(JSON.stringify({ Trip: [trip] }));
    return new Response('{}', { status: 404 });
  };
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=plan', { method: 'POST', body: JSON.stringify({ to: 'Clarion sign', fromId: '740021705' }) }),
    env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
    waitUntil() {},
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.to, 'Clarion Hotel Sign');
  assert.equal(body.toKind, 'poi');
  assert.equal(body.sure, true);
  assert.ok(urls.find((u) => u.includes('/trip?')).includes('destCoordLat=59.3363'));
});

test('action=plan: inget passar, ResRobots gissning med sure=false', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/location.name?')) {
      return new Response(JSON.stringify({ stopLocationOrCoordLocation: [{ StopLocation: { extId: '740000321', name: 'Sigtuna busstation' } }] }));
    }
    if (u.includes('/trip?')) return new Response(JSON.stringify({ Trip: [trip] }));
    return new Response('{}', { status: 404 });
  };
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=plan', { method: 'POST', body: JSON.stringify({ to: 'Clarion sign', fromId: '740021705' }) }),
    env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
    waitUntil() {},
  });
  const body = await res.json();
  assert.equal(body.to, 'Sigtuna busstation');
  assert.equal(body.sure, false);
});

test('action=plan: ett valt förslag söks inte upp igen', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('/trip?')) return new Response(JSON.stringify({ Trip: [trip] }));
    return new Response('{}', { status: 404 });
  };
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=plan', {
      method: 'POST',
      body: JSON.stringify({ to: 'Clarion Hotel Sign', fromId: '740021705', place: { kind: 'poi', name: 'Clarion Hotel Sign', type: 'hotel', lat: 59.3363, lon: 18.0563 } }),
    }),
    env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
    waitUntil() {},
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.toKind, 'poi');
  assert.equal(body.toType, 'hotel');
  assert.equal(urls.length, 1, 'bara resan, ingen location.name');
  const stop = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=plan', {
      method: 'POST',
      body: JSON.stringify({ to: 'Odenplan', fromId: '740021705', place: { kind: 'stop', id: '740001618', name: 'Odenplan' } }),
    }),
    env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
    waitUntil() {},
  });
  assert.equal(stop.status, 200);
  assert.ok(urls.at(-1).includes('destId=740001618'));
});

test('action=places: fungerar utan Trafiklab-nyckel och rangordnar', async () => {
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('bbox=10.5,55,24.3,69.2'));
    return new Response(
      JSON.stringify({
        features: [
          { geometry: { coordinates: [17.7, 59.6] }, properties: { name: 'Signhild', osm_key: 'amenity', osm_value: 'cafe', countrycode: 'SE' } },
          { geometry: { coordinates: [18.0563, 59.3363] }, properties: { name: 'Clarion Hotel Sign', osm_key: 'tourism', osm_value: 'hotel', city: 'Stockholm', countrycode: 'SE' } },
        ],
      })
    );
  };
  const res = await onRequest({ request: new Request('https://alltiditid.se/api/trafik?action=places&q=clarion%20sign'), env: {}, waitUntil() {} });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.places.map((p) => p.name), ['Clarion Hotel Sign']);
  assert.equal(body.source, 'osm');
});
