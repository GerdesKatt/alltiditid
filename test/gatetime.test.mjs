// Hinna till gaten: boarding, gate stänger, gångtid och senaste tid vid säkerhetskontrollen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockMinus, gatePlan, gateRules, walkMinutes } from '../lib/gateTime.mjs';

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
