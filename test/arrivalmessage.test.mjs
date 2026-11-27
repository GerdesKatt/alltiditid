import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArrivalMessage } from '../lib/arrivalMessage.mjs';

const base = { train: 'SJ Snabbtåg 537', stop: 'Lund C', scheduled: '18:37' };

test('försenat tåg: väntad tid och minuter sent', () => {
  assert.equal(
    buildArrivalMessage({ ...base, expected: '18:42', delay: 5 }),
    'Jag är framme i Lund C 18:42 (5 min sent). Sitter på SJ Snabbtåg 537.'
  );
});

test('realtid utan försening säger i tid', () => {
  assert.equal(
    buildArrivalMessage({ ...base, expected: '18:37', delay: 0 }),
    'Jag är framme i Lund C 18:37 (i tid). Sitter på SJ Snabbtåg 537.'
  );
});

test('bara tidtabell: inget löfte om i tid', () => {
  assert.equal(buildArrivalMessage(base), 'Jag är framme i Lund C 18:37. Sitter på SJ Snabbtåg 537.');
});

test('engelska', () => {
  assert.equal(
    buildArrivalMessage({ ...base, expected: '18:42', delay: 5 }, 'en'),
    "I'll be at Lund C at 18:42 (5 min late). I'm on SJ Snabbtåg 537."
  );
});
