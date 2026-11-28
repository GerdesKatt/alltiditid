import test from 'node:test';
import assert from 'node:assert/strict';
import { underTwoMinutes, timelineFill } from '../lib/countdown.mjs';

test('underTwoMinutes: mellan en och två minuter, inga sekunder', () => {
  assert.equal(underTwoMinutes(120_000), false);
  assert.equal(underTwoMinutes(119_999), true);
  assert.equal(underTwoMinutes(60_000), true);
  assert.equal(underTwoMinutes(59_999), false);
  assert.equal(underTwoMinutes(NaN), false);
});

test('timelineFill: tom tio minuter före, full vid gå senast', () => {
  assert.equal(timelineFill(20 * 60_000), 0);
  assert.equal(timelineFill(10 * 60_000), 0);
  assert.equal(timelineFill(5 * 60_000), 0.5);
  assert.equal(timelineFill(0), 1);
  assert.equal(timelineFill(-60_000), 1);
  assert.equal(timelineFill(NaN), 0);
});
