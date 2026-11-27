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

import { rankSearchHits, matchRank } from '../lib/searchHits.mjs';

test('ortnamn: ortens knutpunkt före tättrafikerade hållplatser som bara innehåller ordet', () => {
  const g = (name, n) => ({ id: name, name, average_daily_stop_times: n });
  const hjo = rankSearchHits([g('Bror Hjorths Hus (Uppsala)', 900), g('Hjortstigen', 400), g('Hjo busstation', 120)], 'Hjo');
  assert.equal(hjo[0].name, 'Hjo busstation');
  const kiruna = rankSearchHits(
    [g('Kiruna Församlingshemmet', 300), g('Kiruna sjukhus', 250), g('Kiruna busstation', 200), g('Kiruna station', 40)],
    'kiruna'
  ).map((x) => x.name);
  assert.deepEqual(kiruna.slice(0, 2), ['Kiruna busstation', 'Kiruna station']);
});

test('ortnamn: rangordningen', () => {
  assert.equal(matchRank('Slussen', 'slussen'), 0);
  assert.equal(matchRank('Malmö C', 'Malmo'), 0);
  assert.equal(matchRank('Kiruna sjukhus', 'Kiruna'), 1);
  assert.equal(matchRank('Hjortstigen', 'Hjo'), 2);
  assert.equal(matchRank('Bror Hjorths Hus', 'Hjo'), 3);
});
