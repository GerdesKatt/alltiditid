// Kapacitet: reservräknaren när D1 inte svarar och färre skrivningar av förseningshistorik.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowInMemory, unsavedHistoryRows } from '../functions/api/trafik.js';

test('utan D1 tillåts högst en tiondel av dygnsgränsen per instans', () => {
  const day = '2026-01-01';
  const results = Array.from({ length: 20 }, () => allowInMemory('swedavia-test', 150, day));
  assert.equal(results.filter(Boolean).length, 15);
  assert.equal(allowInMemory('annan', 5, day), true); // minst en
  assert.equal(allowInMemory('swedavia-test', 150, '2026-01-02'), true); // nytt dygn
});

const row = (key, delay, status = 'on-time') => ({ trip_key: key, delay_min: delay, status, expected_at: '2026-01-01T10:00' });

test('samma tur skrivs bara om när den ändrats eller efter 5 minuter', () => {
  const t0 = 1_000_000;
  assert.equal(unsavedHistoryRows([row('a', 0), row('b', 0)], t0).length, 2);
  assert.equal(unsavedHistoryRows([row('a', 0), row('b', 0)], t0 + 30_000).length, 0);
  assert.deepEqual(unsavedHistoryRows([row('a', 3, 'delayed'), row('b', 0)], t0 + 60_000).map((r) => r.trip_key), ['a']);
  assert.equal(unsavedHistoryRows([row('b', 0)], t0 + 6 * 60_000).length, 1);
});
