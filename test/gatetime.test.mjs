// Hinna till gaten: boarding, gate stänger, gångtid och senaste tid vid säkerhetskontrollen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockMinus, gatePlan, gateRules, queueNowFor, typicalQueueFor, walkMinutes } from '../lib/gateTime.mjs';

const flight = (extra = {}) => ({ scheduledAt: '2026-11-30T09:55', expectedAt: '2026-11-30T09:55', status: 'on-time', airlineIata: 'SK', terminal: '5', ...extra });

test('klocktid bakåt, även över midnatt', () => {
  assert.equal(clockMinus('2026-11-30T09:55', 35), '09:20');
  assert.equal(clockMinus('2026-11-30T00:10', 25), '23:45');
});

test('lågprisbolag stänger gaten tidigare, inrikes senare', () => {
  assert.deepEqual(gateRules('FR'), { boardingBefore: 45, closeBefore: 30 });
  assert.deepEqual(gateRules('SK', true), { boardingBefore: 25, closeBefore: 15 });
  assert.deepEqual(gateRules('SK', false), { boardingBefore: 35, closeBefore: 20 });
});

test('gångtid per terminal, med reserv för okända', () => {
  assert.deepEqual(walkMinutes('ARN', '5'), [5, 15]);
  assert.deepEqual(walkMinutes('ARN', '2'), [3, 8]);
  assert.deepEqual(walkMinutes('XYZ'), [2, 8]);
});

test('plan med kö: boarding, gate stänger och senast vid säkerheten', () => {
  const p = gatePlan(flight(), 'ARN', 12);
  assert.equal(p.boarding, '09:20');
  assert.equal(p.gateCloses, '09:35');
  // 35 boarding + 15 gång + 12 kö = 62 min före 09:55.
  assert.equal(p.atSecurity, '08:53');
  assert.equal(p.queue, 12);
});

test('försening flyttar tiderna, inställt och avgånget ger ingen plan', () => {
  assert.equal(gatePlan(flight({ expectedAt: '2026-11-30T10:25', status: 'delayed' }), 'ARN').boarding, '09:50');
  assert.equal(gatePlan(flight({ status: 'cancelled' }), 'ARN'), null);
  assert.equal(gatePlan(flight({ done: true }), 'ARN'), null);
});

test('kön för flygets terminal, med alla köer som reserv', () => {
  const queues = [
    { name: 'Terminal 5F', terminal: '5', minutes: 5 },
    { name: 'Terminal 5F', terminal: '5', minutes: 0, fastTrack: true },
    { name: 'Terminal 2', terminal: '2', minutes: 14 },
  ];
  assert.equal(queueNowFor(queues, '5'), 5);
  assert.equal(queueNowFor(queues, '2'), 14);
  assert.equal(queueNowFor(queues, '4'), 14);
  assert.equal(queueNowFor(queues, ''), 14);
  assert.equal(queueNowFor([{ name: 'Terminal 5F', minutes: 7 }], '5'), 7);
  assert.equal(queueNowFor([], '5'), null);
});

test('typisk kötid timmen före avgång i rätt terminal', () => {
  const forecast = {
    date: '2026-11-30',
    queues: [
      { name: 'Terminal 5F', fastTrack: false, hours: [{ hour: 8, typical: 18 }, { hour: 9, typical: 25 }] },
      { name: 'Terminal 2', fastTrack: false, hours: [{ hour: 8, typical: 4 }] },
    ],
  };
  assert.equal(typicalQueueFor(forecast, flight({ terminal: '5' })), 18);
  assert.equal(typicalQueueFor(forecast, flight({ terminal: '2' })), 4);
  assert.equal(typicalQueueFor({ ...forecast, date: '2026-12-01' }, flight()), null);
  assert.equal(typicalQueueFor(null, flight()), null);
});

// UX-revisionen, fynd 1: ingen security-tid som redan passerat.
import { gateClosedByAirport, gateStage, localMinus } from '../lib/gateTime.mjs';
test('gateStage säger late eller closed när tiden passerat', () => {
  const f = flight({ expectedAt: '2026-11-28T12:35', status: 'delayed' });
  const p = gatePlan(f, 'ARN', 2);
  assert.equal(p.atSecurityAt, '2026-11-28T11:43');
  assert.equal(gateStage(f, p, '2026-11-28T11:30'), 'ok');
  assert.equal(gateStage(f, p, '2026-11-28T11:50'), 'late');
  assert.equal(gateStage(f, p, '2026-11-28T12:48'), 'closed');
  assert.equal(gateStage({ ...f, gateText: 'Gate stängd' }, p, '2026-11-28T11:30'), 'closed');
  assert.equal(gateClosedByAirport({ remarks: ['Utgång stängd'] }), true);
  assert.equal(gateClosedByAirport({ gateText: 'Gå till gate' }), false);
  assert.equal(localMinus('2026-11-29T00:10', 30), '2026-11-28T23:40');
});
