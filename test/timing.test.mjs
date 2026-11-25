// Förseningar, tidiga avgångar, gränser och sortering (A1, A2, A7 i förbättringsplanerna).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { board, localAt, minuteNow } from './helpers.mjs';

const now = minuteNow();
const t = (m, s = 0) => localAt(now, m, s);
const iso = (m) => new Date(now.getTime() + m * 60000).toISOString();

const call = (id, route, sched, real, delaySec, extra = {}) => ({
  scheduled: sched, realtime: real, delay: delaySec, canceled: false, is_realtime: true,
  route, trip: { trip_id: id }, agency: { name: 'SL' }, alerts: [], ...extra,
});
const bus = (des) => ({ name: 'Buss', designation: des, transport_mode: 'BUS', direction: 'Mål ' + des });

const departures = [
  // A1: sekunder i båda tiderna. 330 s men klockslagen säger +6.
  call('M1', { name: 'Gröna linjen', designation: '19', transport_mode: 'METRO', direction: 'Hässelby strand' }, t(10, 40), t(16, 10), 330),
  call('B1', bus('1'), t(10), t(12), 120), // 2 min sen buss → i tid, men nedräkning +2
  call('B2', bus('2'), t(10), t(14), 240), // 4 min sen buss → försenad
  call('B3', bus('3'), t(10), t(7), -180), // 3 min tidig buss → tidig
  call('B4', bus('4'), t(10), t(9, 30), -90), // 1,5 min tidig → inget märke
  call('T1', { name: 'Pendeltåg', designation: '41', transport_mode: 'TRAIN', transport_mode_code: 109, direction: 'Södertälje' }, t(12), t(13), 60, { trip: { trip_id: 'T1', technical_number: 2345 } }),
  // A2: ordinarie 05 men går 15, ska sorteras efter buss 6 (ordinarie 08).
  call('B5', bus('5'), t(5), t(15), 600),
  call('B6', bus('6'), t(8), t(8), 0),
];

function mockFetch() {
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('realtime-api.trafiklab.se/v1/departures/')) {
      return new Response(JSON.stringify({ stops: [{ id: '1', name: 'Teststation' }], departures }));
    }
    if (u.includes('trafikverket')) {
      const body = opts.body || '';
      if (body.includes('TrainStation')) {
        return new Response(JSON.stringify({ RESPONSE: { RESULT: [{ TrainStation: [{ LocationSignature: 'Tst', AdvertisedLocationName: 'Teststation' }] }] } }));
      }
      return new Response(JSON.stringify({ RESPONSE: { RESULT: [{ TrainAnnouncement: [
        { AdvertisedTrainIdent: '2345', AdvertisedTimeAtLocation: iso(12), EstimatedTimeAtLocation: iso(13) },
      ] }] } }));
    }
    return new Response('{}', { status: 404 });
  };
}

const env = { TRAFIKLAB_REALTIME_API_KEY: 'rt', TRAFIKVERKET_API_KEY: 'tv' };
const byLine = (list, line) => list.find((d) => d.line === line);

test('nedräkning, ny tid och +min räknas från samma klockslag (A1)', async () => {
  mockFetch();
  const { body } = await board('action=departures&stopId=740000999&stopName=Teststation&mode=all&direction=departures', env);
  const d = byLine(body.departures, 'Gröna linjen 19');
  assert.equal(d.status, 'delayed');
  assert.equal(d.delayMinutes, 6);
  assert.equal(d.newTime, t(16).slice(11, 16));
  assert.equal(d.expectedAt, t(16).slice(0, 16));
});

test('gränser för försening och tidig avgång', async () => {
  mockFetch();
  const { body } = await board('action=departures&stopId=740000999&stopName=Teststation&mode=all&direction=departures', env);
  const list = body.departures;
  assert.equal(byLine(list, 'Buss 1').status, 'on-time');
  assert.equal(byLine(list, 'Buss 1').expectedAt, t(12).slice(0, 16));
  assert.equal(byLine(list, 'Buss 2').status, 'delayed');
  assert.equal(byLine(list, 'Buss 3').earlyMinutes, 3);
  assert.equal(byLine(list, 'Buss 4').earlyMinutes, undefined);
  assert.equal(byLine(list, 'Pendeltåg 41').status, 'delayed');
  assert.equal(byLine(list, 'Pendeltåg 41').delayMinutes, 1);
});

test('tavlan sorteras på förväntad tid (A2)', async () => {
  mockFetch();
  const { body } = await board('action=departures&stopId=740000999&stopName=Teststation&mode=all&direction=departures', env);
  const order = body.departures.map((d) => d.expectedAt);
  assert.deepEqual(order, [...order].sort());
  const lines = body.departures.map((d) => d.line);
  assert.ok(lines.indexOf('Buss 6') < lines.indexOf('Buss 5'));
});

test('inga interna eller tomma fält i svaret (B6)', async () => {
  mockFetch();
  const { body } = await board('action=departures&stopId=740000999&stopName=Teststation&mode=all&direction=departures', env);
  for (const d of body.departures) {
    for (const [k, v] of Object.entries(d)) {
      assert.ok(!k.startsWith('_'), `internt fält ${k}`);
      assert.ok(v !== '' && !(Array.isArray(v) && v.length === 0), `tomt fält ${k}`);
    }
  }
});
