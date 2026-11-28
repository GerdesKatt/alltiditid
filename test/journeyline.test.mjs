import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyLine } from '../lib/journeyLine.mjs';

const trip = {
  depDate: '2026-11-28',
  legs: [
    { kind: 'walk', from: { time: '10:00' }, to: { time: '10:10' } },
    { kind: 'ride', mode: 'bus', from: { time: '10:10' }, to: { time: '10:30' } },
    { kind: 'ride', mode: 'train', from: { time: '10:40', rtTime: '10:50' }, to: { time: '11:40' } },
  ],
};

test('markeringar vid varje åk och vid målet', () => {
  const j = journeyLine(trip, new Date(2026, 10, 28, 9, 0).getTime());
  assert.equal(j.fill, 0);
  assert.deepEqual(j.marks.map((m) => [Math.round(m.at * 100), m.kind]), [[10, 'ride'], [50, 'ride'], [100, 'end']]);
});

test('fyllningen följer klockan', () => {
  const j = journeyLine(trip, new Date(2026, 10, 28, 10, 50).getTime());
  assert.equal(Math.round(j.fill * 100), 50);
});

test('över midnatt', () => {
  const j = journeyLine({ depDate: '2026-11-28', legs: [{ kind: 'ride', from: { time: '23:40' }, to: { time: '00:20' } }] }, 0);
  assert.ok(j && j.end - j.start === 40 * 60_000);
});

test('tom resa ger null', () => {
  assert.equal(journeyLine({ depDate: '2026-11-28', legs: [] }, 0), null);
});
