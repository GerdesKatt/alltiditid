import test from 'node:test';
import assert from 'node:assert/strict';
import { secondsLabel, timelineFill } from '../lib/countdown.mjs';

test('secondsLabel: tiotal sekunder under två minuter', () => {
  assert.equal(secondsLabel(120_000), null);
  assert.equal(secondsLabel(119_999), '1:50');
  assert.equal(secondsLabel(100_000), '1:40');
  assert.equal(secondsLabel(65_000), '1:00');
  assert.equal(secondsLabel(59_000), '0:50');
  assert.equal(secondsLabel(10_000), '0:10');
  assert.equal(secondsLabel(9_999), null);
  assert.equal(secondsLabel(-5_000), null);
  assert.equal(secondsLabel(NaN), null);
});

test('timelineFill: tom tio minuter före, full vid gå senast', () => {
  assert.equal(timelineFill(20 * 60_000), 0);
  assert.equal(timelineFill(10 * 60_000), 0);
  assert.equal(timelineFill(5 * 60_000), 0.5);
  assert.equal(timelineFill(0), 1);
  assert.equal(timelineFill(-60_000), 1);
  assert.equal(timelineFill(NaN), 0);
});
