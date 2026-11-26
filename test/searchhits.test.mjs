import test from 'node:test';
import assert from 'node:assert/strict';
import { pickSearchHits } from '../lib/searchHits.mjs';

const stop = (name, modes) => ({ id: name, name, transport_modes: modes });
const buses = Array.from({ length: 10 }, (_, i) => stop(`Sandhamnsvägen ${i}`, ['BUS']));

test('utan bryggor: de mest trafikerade', () => {
  assert.deepEqual(pickSearchHits(buses, 8).map((g) => g.name), buses.slice(0, 8).map((g) => g.name));
});

test('en brygga långt ned får plats, på den minst trafikerades bekostnad', () => {
  const hits = pickSearchHits([...buses, stop('Sandhamn', ['BOAT'])], 8).map((g) => g.name);
  assert.equal(hits.length, 8);
  assert.ok(hits.includes('Sandhamn'));
  assert.ok(hits.includes('Sandhamnsvägen 0'));
  assert.ok(!hits.includes('Sandhamnsvägen 7'));
});

test('högst två bryggor läggs till, och kajer känns igen på namnet', () => {
  const quays = [stop('A brygga', undefined), stop('B kajen', []), stop('C', ['FERRY']), stop('D', ['SHIP'])];
  const hits = pickSearchHits([...buses, ...quays], 8).map((g) => g.name);
  assert.equal(hits.length, 8);
  assert.deepEqual(hits.slice(-2), ['A brygga', 'B kajen']);
});

test('färre träffar än gränsen lämnas orörda', () => {
  const few = [stop('X', ['BUS']), stop('Y brygga', ['BOAT'])];
  assert.deepEqual(pickSearchHits(few, 8), few);
});
