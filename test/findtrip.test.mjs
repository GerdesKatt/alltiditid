// "Vilken tur sitter jag på?": kandidater utifrån hållplats och tid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localMinute, tripCandidates } from '../lib/findTrip.mjs';

const now = new Date(2026, 10, 26, 15, 40).getTime();
const at = (m) => localMinute(now + m * 60000);
const dep = (id, m, extra = {}) => ({
  id,
  line: 'Tunnelbana 14',
  destination: 'Fruängen',
  expectedAt: at(m),
  status: 'on-time',
  tripId: `T${id}`,
  tripDate: '2026-11-26',
  transportMode: 'subway',
  ...extra,
});

test('påstigning: senast avgångna först, inom 45 min bakåt', () => {
  const list = [dep('a', -50), dep('b', -30), dep('c', -4), dep('d', 0), dep('e', 5)];
  assert.deepEqual(
    tripCandidates(list, now, 'boarded').map((d) => d.id),
    ['d', 'c', 'b']
  );
});

test('nära: den som passerar närmast nu först', () => {
  const list = [dep('a', -7), dep('b', -2), dep('c', 1), dep('d', 6)];
  const got = tripCandidates(list, now, 'near');
  assert.deepEqual(got.map((d) => d.id), ['c', 'b', 'a']);
  assert.equal(got[0].minutesAgo, -1);
});

test('inställda, turer utan id och fel trafikslag faller bort', () => {
  const list = [
    dep('a', -3, { status: 'cancelled' }),
    dep('b', -3, { tripId: undefined }),
    dep('c', -3, { transportMode: 'bus' }),
    dep('d', -3, { tripId: undefined, trainNumber: '2345', transportMode: 'commuter' }),
    dep('e', -2),
  ];
  assert.deepEqual(tripCandidates(list, now, 'boarded', 'subway').map((d) => d.id), ['e']);
  assert.deepEqual(tripCandidates(list, now, 'boarded').map((d) => d.id), ['e', 'c', 'd']);
});

test('samma tur två gånger visas en gång', () => {
  const list = [dep('a', -3), { ...dep('b', -3), tripId: 'Ta' }];
  assert.equal(tripCandidates(list, now, 'boarded').length, 1);
});
