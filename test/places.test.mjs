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

// "Gata nr ort": orten i frågan ska räknas, och av lika bra träffar vinner den närmaste.
const ALVSJO = { lat: 59.2786, lon: 18.0108 };
const HALLEKIS = { lat: 58.6236, lon: 13.4239 };

test('splitAddress: gata, nummer och ort i olika former', async () => {
  const { splitAddress } = await import('../lib/places.mjs');
  assert.deepEqual(splitAddress('Blåklintsvägen 4 älvsjö'), { street: 'Blåklintsvägen', number: '4', town: 'älvsjö' });
  assert.deepEqual(splitAddress('Storgatan 12, Lund'), { street: 'Storgatan', number: '12', town: 'Lund' });
  assert.deepEqual(splitAddress('Drottninggatan 12b'), { street: 'Drottninggatan', number: '12b', town: '' });
  assert.deepEqual(splitAddress('Kungsgatan 3 A Uppsala'), { street: 'Kungsgatan', number: '3A', town: 'Uppsala' });
  assert.deepEqual(splitAddress('Sankt Eriksgatan 55 Stockholm'), { street: 'Sankt Eriksgatan', number: '55', town: 'Stockholm' });
  assert.deepEqual(splitAddress('Blåklintsvägen 4, 125 33 Älvsjö'), { street: 'Blåklintsvägen', number: '4', town: 'Älvsjö' });
  assert.equal(splitAddress('Odenplan'), null);
  assert.equal(splitAddress('Clarion sign'), null);
});

test('placeScore: husnumret måste stämma', () => {
  assert.equal(placeScore('Blåklintsvägen 4', 'Blåklintsvägen 40, Hällekis'), 0);
  assert.ok(placeScore('Blåklintsvägen 4', 'Blåklintsvägen 4, Hällekis') >= 0.7);
  assert.ok(placeScore('Storgatan 3', 'Storgatan 3A') >= 0.7, '3 passar 3A');
  assert.equal(placeScore('Storgatan 3', 'Storgatan 13'), 0);
  assert.equal(placeScore('Blåklintsvägen 4 älvsjö', 'Blåklintsvägen 4, Hällekis'), 0, 'fel ort passar inte');
  assert.ok(placeScore('Blåklintsvägen 4 älvsjö', 'Blåklintsvägen 4', 'Hägersten-Älvsjö, Stockholm') >= 0.7, 'stadsdelen räknas');
});

test('rankPlaces: samma adress i flera orter, den nära orten eller positionen vinner', () => {
  const list = [
    { kind: 'address', name: 'Blåklintsvägen 4, Hällekis', detail: '', ...HALLEKIS },
    { kind: 'address', name: 'Blåklintsvägen 4, Stockholm', detail: '', lat: 59.2771, lon: 18.0016 },
    { kind: 'address', name: 'Blåklintsvägen 4, Växjö', detail: '', lat: 56.88, lon: 14.8 },
  ];
  const inTown = rankPlaces('Blåklintsvägen 4 älvsjö', list, { town: ALVSJO });
  assert.equal(inTown[0].name, 'Blåklintsvägen 4, Stockholm');
  assert.ok(inTown[0].score >= 0.7, 'säker: ligger i Älvsjö');
  assert.ok(inTown.slice(1).every((p) => p.score < 0.7), 'de andra orterna är bara gissningar');
  assert.equal(rankPlaces('Blåklintsvägen 4', list, { near: { lat: 59.29, lon: 18.02 } })[0].name, 'Blåklintsvägen 4, Stockholm');
  assert.equal(rankPlaces('Blåklintsvägen 4', list, { near: { lat: 56.9, lon: 14.8 } })[0].name, 'Blåklintsvägen 4, Växjö');
  assert.equal(rankPlaces('Blåklintsvägen 4 hällekis', list, { town: HALLEKIS })[0].name, 'Blåklintsvägen 4, Hällekis');
  // Utan ort: Odenplan i Stockholm vinner även från Göteborg över ett sämre namn nära.
  const oden = rankPlaces('odenplan', [
    { kind: 'poi', name: 'Odenplansgatan bageri', detail: '', lat: 57.7, lon: 11.97 },
    { kind: 'stop', id: '1', name: 'Odenplan', lat: 59.343, lon: 18.049 },
  ], { near: { lat: 57.7, lon: 11.97 } });
  assert.equal(oden[0].name, 'Odenplan');
});

test('photonPlaces: stadsdelen kommer med i detaljen', () => {
  const [p] = photonPlaces({
    features: [{ geometry: { coordinates: [18.0016, 59.2771] }, properties: { street: 'Blåklintsvägen', housenumber: '4', city: 'Stockholm', district: 'Hägersten-Älvsjö', locality: 'Solberga', countrycode: 'SE', type: 'house', osm_key: 'place', osm_value: 'house' } }],
  });
  assert.equal(p.name, 'Blåklintsvägen 4');
  assert.equal(p.detail, 'Solberga, Hägersten-Älvsjö, Stockholm');
});

/** ResRobot och Photon som de svarade för "Blåklintsvägen 4 älvsjö": bara Hällekis på hela frågan. */
function alvsjoFetch(urls) {
  return async (url) => {
    const u = decodeURIComponent(String(url));
    urls.push(u);
    if (u.includes('/location.name?')) {
      const input = /input=([^&]*)/.exec(u)[1];
      if (/^älvsjö$/i.test(input)) {
        return new Response(JSON.stringify({ stopLocationOrCoordLocation: [{ StopLocation: { extId: '740000789', name: 'Älvsjö station', ...ALVSJO } }] }));
      }
      if (input === 'Blåklintsvägen 4') {
        return new Response(JSON.stringify({
          stopLocationOrCoordLocation: [
            { CoordLocation: { name: 'Blåklintsvägen 4, Hällekis', ...HALLEKIS } },
            { CoordLocation: { name: 'Blåklintsvägen 4, Stockholm', lat: 59.2771, lon: 18.0016 } },
          ],
        }));
      }
      return new Response(JSON.stringify({ stopLocationOrCoordLocation: [{ CoordLocation: { name: 'Blåklintsvägen 4, Hällekis', ...HALLEKIS } }] }));
    }
    if (u.includes('photon')) return new Response(JSON.stringify({ features: [] }));
    if (u.includes('/trip?')) return new Response(JSON.stringify({ Trip: [trip] }));
    return new Response('{}', { status: 404 });
  };
}

test('action=plan: "Blåklintsvägen 4 älvsjö" blir adressen i Älvsjö, inte Hällekis', async () => {
  const urls = [];
  globalThis.fetch = alvsjoFetch(urls);
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=plan', { method: 'POST', body: JSON.stringify({ to: 'Blåklintsvägen 4 älvsjö', lat: 59.29, lon: 18.0 }) }),
    env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
    waitUntil() {},
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.to, 'Blåklintsvägen 4, Stockholm');
  assert.equal(body.sure, true);
  assert.ok(urls.find((u) => u.includes('/trip?')).includes('destCoordLat=59.2771'));
  assert.ok(!urls.some((u) => u.includes('photon') && u.includes('lat=59.29')), 'positionen skickas inte till platssökningen');
});

test('action=plan: utan ort vinner adressen nära där man står', async () => {
  globalThis.fetch = alvsjoFetch([]);
  const near = async (lat, lon) => {
    const res = await onRequest({
      request: new Request('https://alltiditid.se/api/trafik?action=plan', { method: 'POST', body: JSON.stringify({ to: 'Blåklintsvägen 4', lat, lon }) }),
      env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
      waitUntil() {},
    });
    return (await res.json()).to;
  };
  assert.equal(await near(59.29, 18.0), 'Blåklintsvägen 4, Stockholm');
  assert.equal(await near(58.6, 13.4), 'Blåklintsvägen 4, Hällekis');
});

test('action=places: "gata nr ort" letar gatan nära orten', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    urls.push(u);
    const q = /[?&]q=([^&]*)/.exec(u)[1];
    if (/^älvsjö$/i.test(q)) {
      return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [ALVSJO.lon, ALVSJO.lat] }, properties: { name: 'Älvsjö', osm_key: 'place', osm_value: 'suburb', type: 'suburb', city: 'Stockholm', countrycode: 'SE' } }] }));
    }
    if (q === 'Blåklintsvägen 4') {
      return new Response(JSON.stringify({
        features: [
          { geometry: { coordinates: [18.0016, 59.2771] }, properties: { street: 'Blåklintsvägen', housenumber: '4', city: 'Stockholm', countrycode: 'SE', type: 'house', osm_key: 'place', osm_value: 'house' } },
          { geometry: { coordinates: [HALLEKIS.lon, HALLEKIS.lat] }, properties: { street: 'Blåklintsvägen', housenumber: '4', city: 'Hällekis', countrycode: 'SE', type: 'house', osm_key: 'place', osm_value: 'house' } },
        ],
      }));
    }
    return new Response(JSON.stringify({ features: [] }));
  };
  const res = await onRequest({ request: new Request('https://alltiditid.se/api/trafik?action=places&q=Bl%C3%A5klintsv%C3%A4gen%204%20%C3%A4lvsj%C3%B6'), env: {}, waitUntil() {} });
  const body = await res.json();
  assert.equal(body.places[0].name, 'Blåklintsvägen 4');
  assert.equal(body.places[0].detail, 'Stockholm');
  assert.ok(urls.some((u) => u.includes('q=Blåklintsvägen 4&') && u.includes('lat=59.3')), 'gatan söks nära Älvsjö');
});

test('action=plan: en inskriven start ("from") söks upp som målet', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    urls.push(u);
    if (u.includes('/location.name?')) {
      const input = /input=([^&]*)/.exec(u)[1];
      if (/fruängen/i.test(input)) return new Response(JSON.stringify({ stopLocationOrCoordLocation: [{ StopLocation: { extId: '740021705', name: 'Fruängen T-bana', lat: 59.2856, lon: 17.9649 } }] }));
      return alvsjoFetch([])(url);
    }
    if (u.includes('photon')) return new Response(JSON.stringify({ features: [] }));
    if (u.includes('/trip?')) return new Response(JSON.stringify({ Trip: [trip] }));
    return new Response('{}', { status: 404 });
  };
  const plan = async (body) => {
    const res = await onRequest({
      request: new Request('https://alltiditid.se/api/trafik?action=plan', { method: 'POST', body: JSON.stringify(body) }),
      env: { TRAFIKLAB_RESROBOT_KEY: 'rr' },
      waitUntil() {},
    });
    return { status: res.status, body: await res.json() };
  };
  // En adress som start blir koordinater.
  const a = await plan({ to: 'Fruängen', from: 'Blåklintsvägen 4 älvsjö' });
  assert.equal(a.status, 200);
  assert.equal(a.body.from, 'Blåklintsvägen 4, Stockholm');
  assert.equal(a.body.fromHere, false);
  assert.ok(urls.findLast((u) => u.includes('/trip?')).includes('originCoordLat=59.27710'));
  // En hållplats som start blir dess id.
  const b = await plan({ to: 'Blåklintsvägen 4 älvsjö', from: 'fruängen' });
  assert.equal(b.status, 200);
  assert.equal(b.body.from, 'Fruängen T-bana');
  assert.ok(urls.findLast((u) => u.includes('/trip?')).includes('originId=740021705'));
  // Utan start alls: be om den.
  const c = await plan({ to: 'Fruängen' });
  assert.equal(c.status, 400);
  assert.equal(c.body.error, 'Skriv var du startar.');
});
