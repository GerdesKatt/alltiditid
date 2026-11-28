import test from 'node:test';
import assert from 'node:assert/strict';
import { median, summarize, punctualityKey } from '../lib/punctuality.mjs';

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3);
  assert.equal(median([]), null);
});

const rows = (n, delay, weekday, line = 'Buss 4', destination = 'Radiohuset') =>
  Array.from({ length: n }, () => ({ line, destination, delay_min: delay, weekday }));

test('summarize: veckodag när det finns nog, annars alla dagar', () => {
  const day = summarize([...rows(10, 3, 6), ...rows(10, 0, 2)], 6);
  assert.deepEqual(day[punctualityKey('Buss 4', 'Radiohuset')], { late: 3, n: 10, weekday: true });
  const all = summarize([...rows(4, 3, 6), ...rows(8, 4, 2)], 6);
  assert.deepEqual(all[punctualityKey('Buss 4', 'Radiohuset')], { late: 4, n: 12, weekday: false });
});

test('summarize: tyst när få mätningar eller i tid', () => {
  assert.deepEqual(summarize(rows(9, 5, 6), 6), {});
  assert.deepEqual(summarize(rows(20, 1, 6), 6), {});
});

import { doorRange } from '../lib/punctuality.mjs';
test('doorRange', () => {
  assert.deepEqual(doorRange('Kort tåg, Dörr 2-13'), { from: 2, to: 13, total: 24 });
  assert.deepEqual(doorRange('Kort tåg. Stannar vid dörrarna 13–24'), { from: 13, to: 24, total: 24 });
  assert.equal(doorRange('Kort tåg'), null);
  assert.equal(doorRange('Dörr 9-3'), null);
});
