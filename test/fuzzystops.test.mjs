// "Menade du …?" för stavfel i hållplatssöket (UX-revisionen, fynd 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, fuzzyStops } from '../lib/fuzzyStops.mjs';

const stops = [
  { name: 'Uppsala Centralstation', daily: 900 },
  { name: 'Uppsala Science Park', daily: 50 },
  { name: 'Gullmarsplan', daily: 2000 },
  { name: 'Göteborg Centralstation', daily: 3000 },
  { name: 'Slussen', daily: 2500 },
];

test('bokstäver i fel ordning är ett fel', () => {
  assert.equal(editDistance('uppsla', 'uppsal'), 1);
  assert.equal(editDistance('gullmarsplna', 'gullmarsplan'), 1);
});

test('stavfel hittar rätt hållplats, störst först', () => {
  assert.equal(fuzzyStops('uppsla', stops)[0].name, 'Uppsala Centralstation');
  assert.equal(fuzzyStops('gulmarsplan', stops)[0].name, 'Gullmarsplan');
  assert.equal(fuzzyStops('goteborg', stops)[0].name, 'Göteborg Centralstation');
  assert.equal(fuzzyStops('slusen', stops)[0].name, 'Slussen');
});

test('nonsens och korta ord ger inga förslag', () => {
  assert.deepEqual(fuzzyStops('xqzv', stops), []);
  assert.deepEqual(fuzzyStops('upp', stops), []);
});
