import test from 'node:test';
import assert from 'node:assert/strict';
import { tripJourney, uniqueAlerts } from '../lib/trips.mjs';

const call = (name, arr, dep, extra = {}) => ({
  stop: { id: `s-${name}`, area_id: `a-${name}`, name },
  ...(arr ? { scheduledArrival: `2026-11-26T${arr[0]}:00`, realtimeArrival: `2026-11-26T${arr[1] || arr[0]}:00` } : {}),
  ...(dep ? { scheduledDeparture: `2026-11-26T${dep[0]}:00`, realtimeDeparture: `2026-11-26T${dep[1] || dep[0]}:00` } : {}),
  is_realtime: true,
  ...extra,
});
const trip = (calls) => ({
  agency: { name: 'SL' },
  route: { name: 'Buss', designation: '4', origin: { name: 'Gullmarsplan' }, destination: { name: 'Radiohuset' } },
  trip: { trip_id: '1', start_date: '2026-11-26' },
  calls,
});
const four = [
  call('Gullmarsplan', null, ['14:00', '14:02']),
  call('Skanstull', ['14:04', '14:06'], ['14:04', '14:06'], { scheduled_platform: { designation: 'B' } }),
  call('Zinkensdamm', ['14:10', '14:13'], ['14:10', '14:13']),
  call('Radiohuset', ['14:30', '14:33'], null),
];

test('före avgång: inte avgått, inga hållplatser passerade', () => {
  const j = tripJourney(trip(four), '2026-11-26T13:55');
  assert.equal(j.position, 'Har inte avgått från Gullmarsplan än');
  assert.ok(j.stops.every((s) => !s.passed));
  assert.equal(j.from, 'Gullmarsplan');
  assert.equal(j.to, 'Radiohuset');
});

test('på väg: lämnat senaste hållplatsen, nästa och försening anges', () => {
  const j = tripJourney(trip(four), '2026-11-26T14:08');
  assert.equal(j.position, 'Har lämnat Skanstull, nästa Zinkensdamm · 3 min sen');
  assert.deepEqual(j.stops.map((s) => s.passed), [true, true, false, false]);
  // Passerad hållplats: faktisk tid. Kommande: väntad tid.
  assert.equal(j.stops[1].departure.actual, '14:06');
  assert.equal(j.stops[2].departure.estimated, '14:13');
  assert.equal(j.stops[2].departure.delay, 3);
  // Samma ankomst och avgång visas en gång.
  assert.equal(j.stops[2].arrival, undefined);
  assert.equal(j.stops[1].trackText, 'B');
  assert.equal(j.stops[1].areaId, 'a-Skanstull');
});

test('framme: sista hållplatsen räknas på ankomsten', () => {
  const j = tripJourney(trip(four), '2026-11-26T14:40');
  assert.equal(j.position, 'Framme i Radiohuset · 3 min sen');
  assert.ok(j.stops.every((s) => s.passed));
  assert.equal(j.stops[0].arrival, undefined);
  assert.equal(j.stops[3].departure, undefined);
});

test('står vid en hållplats mellan ankomst och avgång', () => {
  const calls = [call('A', null, ['10:00']), call('B', ['10:10'], ['10:15']), call('C', ['10:30'], null)];
  assert.equal(tripJourney(trip(calls), '2026-11-26T10:12').position, 'Står i B · i tid');
});

test('utan realtid: läget följer tidtabellen och säger det', () => {
  const calls = four.map((c) => ({ ...c, is_realtime: false }));
  const j = tripJourney(trip(calls), '2026-11-26T14:08');
  assert.match(j.position, / · enligt tidtabell$/);
  assert.equal(j.stops[2].departure.estimated, undefined);
  assert.equal(j.stops[2].departure.delay, 0);
});

test('äldre stavning av fälten och tomt svar', () => {
  const calls = [
    { stop: { id: '1', name: 'A' }, scheduled: '2026-11-26T09:00:00', realtime: '2026-11-26T09:00:00', is_realtime: true },
    { stop: { id: '2', name: 'B' }, scheduled: '2026-11-26T09:10:00', realtime: '2026-11-26T09:12:00', is_realtime: true, canceled: true },
  ];
  const j = tripJourney(trip(calls), '2026-11-26T09:05');
  assert.equal(j.stops[1].arrival.estimated, '09:12');
  assert.equal(j.stops[1].cancelled, true);
  assert.deepEqual(tripJourney({}, '2026-11-26T09:05').stops, []);
});

test('samma störning skriven på två sätt visas en gång', () => {
  assert.deepEqual(
    uniqueAlerts([
      { title: 'Stn.medd. Avstängd hiss Skärmarbrink' },
      { title: 'Avstängd hiss vid Skärmarbrink' },
      { title: 'Inställda avgångar' },
      { title: 'Inställda avgångar' },
    ]),
    ['Avstängd hiss vid Skärmarbrink', 'Inställda avgångar']
  );
  assert.deepEqual(uniqueAlerts(undefined), []);
});

import { applyGps, distanceText } from '../lib/trips.mjs';
import { locateOnRoute } from '../lib/gtfsrt.mjs';

const geo = (calls) => calls.map((c, i) => ({ ...c, stop: { ...c.stop, lat: 59.3 + i * 0.01, lon: 18.0 } }));

test('GPS: läget hamnar mellan rätt hållplatser och passerade följer GPS', () => {
  const j = tripJourney(trip(geo(four)), '2026-11-26T14:08');
  // Tiderna säger "lämnat Skanstull", GPS säger en kvart in på sträckan Skanstull–Zinkensdamm.
  const loc = locateOnRoute(j.stops, 59.3125, 18.0);
  const g = applyGps(j, loc, { lat: 59.3125, lon: 18.0, at: 1000 }, 1030);
  assert.equal(g.position, 'Mellan Skanstull och Zinkensdamm · 850 m kvar · 3 min sen');
  assert.deepEqual(g.stops.map((s) => s.passed), [true, true, false, false]);
  assert.equal(g.gps.after, 1);
  assert.equal(g.gps.metersToNext, loc.metersToNext);
});

test('GPS: nära nästa hållplats står det Vid, och GPS före tiderna flyttar passerade', () => {
  const j = tripJourney(trip(geo(four)), '2026-11-26T14:08');
  const g = applyGps(j, locateOnRoute(j.stops, 59.3297, 18.0), { lat: 59.3297, lon: 18.0, at: 1000 }, 1010);
  assert.equal(g.position, 'Vid Radiohuset · 3 min sen');
  assert.deepEqual(g.stops.map((s) => s.passed), [true, true, true, false]);
});

test('GPS som inte går att lita på ändrar ingenting', () => {
  const j = tripJourney(trip(geo(four)), '2026-11-26T14:08');
  const loc = locateOnRoute(j.stops, 59.3125, 18.0);
  // Gammal punkt.
  assert.equal(applyGps(j, loc, { lat: 59.3125, lon: 18.0, at: 1000 }, 1400), j);
  // Långt från linjen.
  assert.equal(applyGps(j, locateOnRoute(j.stops, 59.3125, 18.05), { lat: 59.3125, lon: 18.05, at: 1000 }, 1010), j);
  // Ingen sträcka (koordinater saknas).
  const bare = tripJourney(trip(four), '2026-11-26T14:08');
  assert.equal(applyGps(bare, locateOnRoute(bare.stops, 59.3, 18.0), { lat: 59.3, lon: 18.0, at: 1000 }, 1010), bare);
  // Framme enligt tiderna.
  const done = tripJourney(trip(geo(four)), '2026-11-26T14:40');
  assert.equal(applyGps(done, locateOnRoute(done.stops, 59.31, 18.0), { lat: 59.31, lon: 18.0, at: 1000 }, 1010), done);
});

test('avstånd skrivs i jämna 50 m eller km med en decimal', () => {
  assert.equal(distanceText(20), '50 m');
  assert.equal(distanceText(834), '850 m');
  assert.equal(distanceText(1240), '1,2 km');
});
