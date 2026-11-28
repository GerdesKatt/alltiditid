import test from 'node:test';
import assert from 'node:assert/strict';
import { weekStart, weekTally } from '../lib/week.mjs';

test('veckan börjar på måndag', () => {
  assert.equal(weekStart('2026-11-28'), '2026-11-23'); // lördag
  assert.equal(weekStart('2026-11-29'), '2026-11-23'); // söndag
  assert.equal(weekStart('2026-11-30'), '2026-11-30'); // måndag
});

test('räknar bara veckans resor, i tid är högst 2 min sent', () => {
  const notes = [
    { d: '2026-11-23', late: 0 },
    { d: '2026-11-25', late: 2 },
    { d: '2026-11-27', late: 6 },
    { d: '2026-11-20', late: 0 },
  ];
  assert.deepEqual(weekTally(notes, '2026-11-28'), { total: 3, onTime: 2 });
});
