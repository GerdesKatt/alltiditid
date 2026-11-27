// "Annat sätt härifrån": gles tavla, Uber-länken och närmaste lånecykel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedLicense,
  BIKE_SYSTEMS,
  inStockholm,
  nearestStation,
  sparseBoard,
  systemsNear,
  uberLink,
} from '../lib/mobility.mjs';
import { board } from './helpers.mjs';

const NOW = new Date(2026, 10, 27, 22, 0).getTime();
const at = (min) => {
  const d = new Date(NOW + min * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const parse = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null;
};

test('tät tavla är inte gles', () => {
  assert.equal(sparseBoard([{ expectedAt: at(4) }, { expectedAt: at(40) }], NOW, parse), null);
  assert.equal(sparseBoard([{ expectedAt: at(20) }], NOW, parse), null);
});

test('nästa avgång om mer än 20 min är glest', () => {
  assert.deepEqual(sparseBoard([{ expectedAt: at(47) }, { expectedAt: at(90) }], NOW, parse), { kind: 'wait', minutes: 47 });
});

test('inställda och redan gångna räknas inte', () => {
  const list = [{ expectedAt: at(-2) }, { expectedAt: at(5), status: 'cancelled' }, { expectedAt: at(33) }];
  assert.deepEqual(sparseBoard(list, NOW, parse), { kind: 'wait', minutes: 33 });
});

test('inga avgångar alls, eller bara inställda', () => {
  assert.deepEqual(sparseBoard([], NOW, parse), { kind: 'none' });
  assert.deepEqual(sparseBoard([{ expectedAt: at(5), status: 'cancelled' }], NOW, parse), { kind: 'none' });
});

test('ett tåg som står kvar gör tavlan icke-gles', () => {
  assert.equal(sparseBoard([{ expectedAt: at(-3), pending: true }, { expectedAt: at(60) }], NOW, parse), null);
});

test('Uber-länken har hållplatsen som upphämtning', () => {
  const u = new URL(uberLink(57.7089, 11.9736, 'Järntorget'));
  assert.equal(u.origin + u.pathname, 'https://m.uber.com/ul/');
  assert.equal(u.searchParams.get('action'), 'setPickup');
  assert.equal(u.searchParams.get('pickup[latitude]'), '57.7089');
  assert.equal(u.searchParams.get('pickup[nickname]'), 'Järntorget');
});

test('Stockholm men inte Göteborg', () => {
  assert.ok(inStockholm(59.33, 18.06));
  assert.ok(!inStockholm(57.7, 11.97));
});

test('rätt system för rätt stad, inga i Stockholm', () => {
  assert.deepEqual(systemsNear(57.70, 11.97).map((s) => s.id), ['styrochstall']);
  assert.deepEqual(systemsNear(55.70, 13.19).map((s) => s.id), ['lundahoj']);
  assert.deepEqual(systemsNear(55.60, 13.00).map((s) => s.id), ['donkey_malmoe']);
  assert.deepEqual(systemsNear(59.33, 18.06), []);
  assert.ok(BIKE_SYSTEMS.every((s) => s.base.endsWith('/')));
});

test('bara öppna licenser', () => {
  assert.ok(allowedLicense({ data: { license_id: 'CC0-1.0' } }));
  assert.ok(allowedLicense({ data: { license_url: 'https://developer.jcdecaux.com/files/Open-Licence-fr.pdf' } }));
  assert.ok(!allowedLicense({ data: {} }));
  assert.ok(!allowedLicense(null));
});

const info = {
  data: {
    stations: [
      { station_id: 'a', name: 'Långt bort', lat: 57.72, lon: 11.97 },
      { station_id: 'b', name: [{ language: 'sv', text: 'Järntorget' }], lat: 57.7001, lon: 11.9531 },
      { station_id: 'c', name: 'Tom', lat: 57.7, lon: 11.953 },
      { station_id: 'd', name: 'Stängd', lat: 57.7, lon: 11.9532 },
    ],
  },
};
const status = {
  data: {
    stations: [
      { station_id: 'a', num_bikes_available: 9, is_renting: true },
      { station_id: 'b', num_vehicles_available: 4, is_renting: true },
      { station_id: 'c', num_bikes_available: 0, is_renting: true },
      { station_id: 'd', num_bikes_available: 3, is_renting: false },
    ],
  },
};

test('närmaste station med lediga cyklar, inom 500 m', () => {
  const near = nearestStation(57.7, 11.953, info, status);
  assert.equal(near.station, 'Järntorget');
  assert.equal(near.bikes, 4);
  assert.ok(near.meters < 20, String(near.meters));
  assert.equal(nearestStation(57.75, 11.9, info, status), null);
});

test('action=mobility utan koordinater ger 400', async () => {
  const res = await board('action=mobility', {});
  assert.equal(res.status, 400);
});

test('action=mobility i Stockholm frågar inga flöden', async () => {
  const res = await board('action=mobility&lat=59.33&lon=18.06', {});
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { bikes: [] });
});

test('action=mobility i Göteborg ger närmaste Styr & Ställ', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const body = u.endsWith('system_information.json')
      ? { data: { license_id: 'CC0-1.0' } }
      : u.endsWith('station_information.json')
      ? info
      : status;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const res = await board('action=mobility&lat=57.7&lon=11.953', {});
    assert.equal(res.body.bikes.length, 1);
    assert.equal(res.body.bikes[0].name, 'Styr & Ställ');
    assert.equal(res.body.bikes[0].station, 'Järntorget');
  } finally {
    globalThis.fetch = real;
  }
});
