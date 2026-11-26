// Flyg från Swedavia: tolkning av svaret, tavlan och anropsgränsen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/trafik.js';
import { flightBoard, flightMatches, normalizeFlight, utcToLocal, waitTimes } from '../lib/flights.mjs';

const utcIn = (min) => new Date(Date.now() + min * 60000).toISOString().slice(0, 19) + 'Z';

const flight = (id, schedMin, extra = {}) => ({
  FlightId: id,
  ArrivalAirportSwedish: 'London',
  AirlineOperator: { IATA: 'SK', ICAO: 'SAS', Name: 'SAS' },
  DepartureTime: { ScheduledUtc: utcIn(schedMin), EstimatedUtc: utcIn(schedMin), ActualUtc: null },
  LocationAndStatus: { Terminal: '5', Gate: 'F32', GateActionSwedish: 'Boarding', FlightLegStatus: 'SCH', FlightLegStatusSwedish: '' },
  CheckIn: { CheckInDeskFrom: 10, CheckInDeskTo: 20 },
  CodeShareData: ['LH1234'],
  RemarksSwedish: [],
  DIIndicator: 'I',
  ...extra,
});

test('UTC blir svensk tid', () => {
  assert.equal(utcToLocal('2026-07-01T10:05:00Z'), '2026-07-01T12:05');
  assert.equal(utcToLocal('2026-12-01T10:05:00'), '2026-12-01T11:05');
});

test('ett flyg tolkas: försening, gate, codeshare', () => {
  const f = normalizeFlight(
    flight('SK1529', 30, { DepartureTime: { ScheduledUtc: utcIn(30), EstimatedUtc: utcIn(55) } }),
    'departures'
  );
  assert.equal(f.flightId, 'SK1529');
  assert.equal(f.status, 'delayed');
  assert.equal(f.delayMinutes, 25);
  assert.equal(f.terminal, '5');
  assert.equal(f.gate, 'F32');
  assert.equal(f.checkIn, '10–20');
  assert.deepEqual(f.codeshare, ['LH1234']);
});

test('camelCase fungerar lika bra, och inställda flyg känns igen', () => {
  const f = normalizeFlight(
    { flightId: 'DY4321', arrivalAirportSwedish: 'Oslo', departureTime: { scheduledUtc: utcIn(20) }, locationAndStatus: { flightLegStatus: 'CAN' } },
    'departures'
  );
  assert.equal(f.status, 'cancelled');
  assert.equal(f.place, 'Oslo');
});

test('tavlan sorterar och tar bort gamla flyg', () => {
  const nowLocal = utcToLocal(new Date().toISOString());
  const list = flightBoard(
    [{ Flights: [flight('B2', 40), flight('A1', 10), flight('OLD', -60), flight('A1', 10)] }],
    'departures',
    nowLocal
  );
  assert.deepEqual(list.map((f) => f.flightId), ['A1', 'B2']);
});

test('kötider kortas och sorteras', () => {
  const q = waitTimes([
    { QueueName: 'Security Terminal 5D FastTrack', Terminal: '5', CurrentProjectedWaitTime: 2, IsFastTrack: true, CurrentTime: utcIn(0) },
    { QueueName: 'Security Terminal 5D', Terminal: '5', CurrentProjectedWaitTime: 9, IsFastTrack: false, CurrentTime: utcIn(0) },
  ]);
  assert.deepEqual(q.map((x) => [x.name, x.minutes, x.fastTrack]), [['Terminal 5D', 9, false], ['Terminal 5D', 2, true]]);
});

test('API: flyg hämtas med nyckeln, och dygnsgränsen stoppar fler anrop', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), key: init?.headers?.['Ocp-Apim-Subscription-Key'] });
    return new Response(JSON.stringify({ Flights: [flight('SK1', 15)] }));
  };
  let n = 0;
  const db = {
    prepare: (sql) => ({
      run: async () => ({}),
      bind: () => ({ first: async () => ({ n: ++n }) }),
    }),
  };
  const call = () =>
    onRequest({
      request: new Request('https://alltiditid.se/api/trafik?action=flights&airport=arn&direction=departures'),
      env: { SWEDAVIA_FLIGHTINFO_KEY: 'k', HISTORY: db },
      waitUntil() {},
    });
  const res = await call();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.flights[0].flightId, 'SK1');
  assert.ok(calls[0].url.startsWith('https://api.swedavia.se/flightinfo/v2/ARN/departures/'));
  assert.equal(calls[0].key, 'k');

  n = 1000; // gränsen nådd
  const before = calls.length;
  const capped = await call();
  assert.equal(capped.status, 503);
  assert.equal(calls.length, before, 'inget nytt anrop till Swedavia');
});

test('API: utan nyckel svarar flyg tydligt, utan Trafiklab-nyckel', async () => {
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=flights&airport=GOT'),
    env: {},
    waitUntil() {},
  });
  assert.equal(res.status, 503);
});

test('ny tid i statustexten och terminal utan T', () => {
  const f = normalizeFlight(
    flight('TK1794', 10, {
      DepartureTime: { ScheduledUtc: '2026-11-26T10:20:00Z', EstimatedUtc: null },
      LocationAndStatus: { Terminal: 'T5', FlightLegStatusSwedish: 'Beräknad 11:40' },
    }),
    'departures'
  );
  assert.equal(f.terminal, '5');
  assert.equal(f.status, 'delayed');
  assert.equal(f.newTime, '11:40');
  assert.equal(f.delayMinutes, 20);
});

test('filtret hittar flyg på kod, svenskt och engelskt namn och flygplatsnamn', () => {
  const cph = normalizeFlight(
    flight('SK1417', 30, {
      ArrivalAirportSwedish: 'Köpenhamn',
      ArrivalAirportEnglish: 'Copenhagen',
      ArrivalAirportIata: 'CPH',
    }),
    'departures'
  );
  assert.equal(cph.placeIata, 'CPH');
  assert.equal(cph.placeEn, 'Copenhagen');
  for (const q of ['CPH', 'cph', 'Köpenhamn', 'kopenhamn', 'Copenhagen', 'copen', 'Kastrup', 'kastrup', 'SK1417', 'sk 1417', 'SAS', 'LH1234']) {
    assert.ok(flightMatches(cph, q), q);
  }
  for (const q of ['OSL', 'Oslo', 'Gardermoen', 'Heathrow']) assert.ok(!flightMatches(cph, q), q);
});

test('filtret känner igen orten även när koden saknas i svaret', () => {
  const osl = normalizeFlight(flight('DY4321', 20, { ArrivalAirportSwedish: 'Oslo' }), 'departures');
  assert.ok(flightMatches(osl, 'OSL'));
  assert.ok(flightMatches(osl, 'Gardermoen'));
  const lon = normalizeFlight(flight('BA777', 20), 'departures');
  assert.ok(flightMatches(lon, 'Heathrow'));
  assert.ok(flightMatches(lon, 'LHR'));
});

test('ankomster matchar avreseortens kod och via-orter', () => {
  const f = normalizeFlight(
    {
      FlightId: 'AY811',
      DepartureAirportSwedish: 'Helsingfors',
      DepartureAirportEnglish: 'Helsinki',
      DepartureAirportIata: 'HEL',
      ViaDestinations: [{ AirportSwedish: 'Åbo', AirportEnglish: 'Turku', AirportIata: 'TKU' }],
      ArrivalTime: { ScheduledUtc: utcIn(30) },
    },
    'arrivals'
  );
  for (const q of ['HEL', 'Helsinki', 'helsingfors', 'Vantaa', 'TKU', 'Åbo']) assert.ok(flightMatches(f, q), q);
});
