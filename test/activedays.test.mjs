// Trogna användare: antal aktiva dagar senaste veckan, räknat ur Hems besök.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeDays } from '../lib/activeDays.mjs';

test('olika dagar senaste 7 dygnen, flera besök samma dag räknas en gång', () => {
  const now = Date.parse('2026-11-27T08:00:00Z');
  const d = (days, h = 0) => now - days * 86_400_000 + h * 3_600_000;
  const list = [{ t: d(0) }, { t: d(0, -1) }, { t: d(1) }, { t: d(3) }, { t: d(8) }];
  assert.equal(activeDays(list, now), 3);
});
