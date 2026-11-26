import test from 'node:test';
import assert from 'node:assert/strict';
import { locateOnRoute, metersBetween, vehiclePositions } from '../lib/gtfsrt.mjs';

// En liten protobuf-skrivare för testerna.
const varint = (n) => {
  const out = [];
  let v = n;
  while (v >= 128) {
    out.push((v % 128) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
};
const len = (field, bytes) => [...varint(field * 8 + 2), ...varint(bytes.length), ...bytes];
const str = (field, s) => len(field, [...new TextEncoder().encode(s)]);
const f32 = (field, x) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, x, true);
  return [...varint(field * 8 + 5), ...b];
};
const vint = (field, n) => [...varint(field * 8), ...varint(n)];
const vehicle = (tripId, lat, lon, ts) =>
  len(2, [
    ...str(1, `e-${tripId}`),
    ...len(4, [
      ...len(1, [...str(1, tripId), ...str(3, '20261126')]),
      ...len(2, [...f32(1, lat), ...f32(2, lon), ...f32(3, 90)]),
      ...vint(3, 7),
      ...vint(5, ts),
      ...len(8, str(1, 'fordon')),
    ]),
  ]);
const header = len(1, [...str(1, '2.0'), ...vint(3, 1795700000)]);

test('läser tur, position och tid för varje fordon', () => {
  const feed = new Uint8Array([...header, ...vehicle('14010000123', 59.30012, 18.07954, 1795700123), ...vehicle('t2', 57.7, 11.97, 1795700100)]);
  const pos = vehiclePositions(feed);
  assert.deepEqual(Object.keys(pos), ['14010000123', 't2']);
  assert.deepEqual(pos['14010000123'], [59.30012, 18.07954, 1795700123]);
});

test('fordon utan tur eller med nollposition hoppas över, avklippt flöde ger det som hanns med', () => {
  const full = [...header, ...vehicle('ok', 59.3, 18.0, 5), ...vehicle('', 59.3, 18.0, 5), ...vehicle('noll', 0, 0, 5)];
  assert.deepEqual(Object.keys(vehiclePositions(new Uint8Array(full))), ['ok']);
  const cut = new Uint8Array([...full, ...vehicle('sist', 59.4, 18.1, 6)].slice(0, full.length + 10));
  assert.deepEqual(Object.keys(vehiclePositions(cut)), ['ok']);
  assert.deepEqual(vehiclePositions(new Uint8Array([])), {});
});

test('läget på sträckan: mellan vilka hållplatser och hur långt kvar', () => {
  // Tre hållplatser rakt norrut, ungefär 1,1 km emellan.
  const stops = [{ lat: 59.3, lon: 18.0 }, { lat: 59.31, lon: 18.0 }, { lat: 59.32, lon: 18.0 }];
  const mid = locateOnRoute(stops, 59.3125, 18.0005);
  assert.equal(mid.index, 1);
  assert.ok(Math.abs(mid.fraction - 0.25) < 0.01);
  assert.ok(Math.abs(mid.metersToNext - 834) < 15, String(mid.metersToNext));
  assert.ok(mid.offRoute < 40);
  // Före första hållplatsen: läggs på första sträckans början.
  assert.equal(locateOnRoute(stops, 59.29, 18.0).fraction, 0);
  // Saknade koordinater: ingen sträcka att lägga punkten på.
  assert.equal(locateOnRoute([{}, {}], 59.3, 18.0), null);
  assert.ok(Math.abs(metersBetween(59.3, 18.0, 59.31, 18.0) - 1112) < 5);
});

// Hela vägen genom API:t: turens resa med GPS-läge från operatörens flöde.
import { board, localAt, minuteNow } from './helpers.mjs';

test('API: turens resa får GPS-läge när operatören har det, annars läget ur tiderna', async () => {
  const now = minuteNow();
  const at = (m) => localAt(now, m);
  const calls = [-10, -5, 5, 15].map((m, i) => ({
    stop: { id: `s${i}`, area_id: `a${i}`, name: ['Start', 'Två', 'Tre', 'Slut'][i], lat: 59.3 + i * 0.01, lon: 18.0 },
    ...(i > 0 ? { scheduledArrival: at(m), realtimeArrival: at(m) } : {}),
    ...(i < 3 ? { scheduledDeparture: at(m), realtimeDeparture: at(m) } : {}),
    is_realtime: true,
  }));
  const feeds = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/v1/trips/')) {
      return new Response(JSON.stringify({
        // Så heter SL i Trafiklabs riktiga svar. "Kundtjänst" får inte tolkas som UL eller SL av misstag.
        agency: { name: /tur-vt/.test(u) ? 'Konsulttrafik AB' : 'AB SL Kundtjänst' },
        route: { name: 'Buss', designation: '4', transport_mode: 'BUS', origin: { name: 'Start' }, destination: { name: 'Slut' } },
        trip: { trip_id: 'x', start_date: '2026-11-26' },
        calls,
      }));
    }
    if (u.includes('opendata.samtrafiken.se/gtfs-rt-sweden/')) {
      feeds.push(u);
      const ts = Math.floor(Date.now() / 1000) - 20;
      return new Response(new Uint8Array([...header, ...vehicle('tur-1', 59.315, 18.0, ts)]));
    }
    return new Response('{}', { status: 404 });
  };
  const env = { TRAFIKLAB_REALTIME_API_KEY: 'rt', TRAFIKLAB_GTFS_RT_KEY: 'gk' };

  const withGps = await board('action=trip&id=tur-1&date=2026-11-26', env);
  assert.equal(withGps.status, 200);
  assert.match(withGps.body.position, /^Mellan Två och Tre · 550 m kvar/);
  assert.equal(withGps.body.gps.after, 1);
  assert.match(feeds[0], /\/gtfs-rt-sweden\/sl\/VehiclePositionsSweden\.pb\?key=gk$/);

  // Turen finns inte i flödet: läget räknas ur tiderna.
  const noFix = await board('action=trip&id=tur-2&date=2026-11-26', env);
  assert.equal(noFix.body.gps, undefined);
  assert.match(noFix.body.position, /^Har lämnat Två, nästa Tre/);

  // Okänd operatör eller ingen nyckel: inget anrop till flödet.
  const before = feeds.length;
  await board('action=trip&id=tur-vt&date=2026-11-26', env);
  await board('action=trip&id=tur-3&date=2026-11-26', { TRAFIKLAB_REALTIME_API_KEY: 'rt' });
  assert.equal(feeds.length, before);
});
