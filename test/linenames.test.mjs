import test from 'node:test';
import assert from 'node:assert/strict';
import { isRouteName, shortLineName, trackText } from '../lib/lineNames.mjs';

test('sträckor byts mot trafikslaget', () => {
  assert.equal(shortLineName('Lindängen-Södervärn-Malmö C-Västra hamnen', 'Buss'), 'Buss');
  assert.equal(shortLineName('Malmö - Veberöd - Sjöbo', 'Buss'), 'Buss');
  assert.equal(shortLineName('Ø Kalmar - Växjö - Hässleholm - Malmö - København', 'Tåg'), 'Öresundståg');
  assert.equal(shortLineName('Ø Göteborg-Halmstad-Helsingborg-Malmö-Købe', 'Tåg'), 'Öresundståg');
});

test('vanliga linjenamn står kvar', () => {
  for (const n of ['Gröna linjen', 'X-tåget', 'Arlanda Express', 'Pågatågen', 'SJ Snabbtåg', 'Spårvagn']) {
    assert.equal(isRouteName(n), false, n);
    assert.equal(shortLineName(n, 'Buss'), n);
  }
});

test('spår och läge i samma form', () => {
  assert.equal(trackText('1b', 'train'), 'Spår 1b');
  assert.equal(trackText('Spår 4a', 'train'), 'Spår 4a');
  assert.equal(trackText('C', 'bus'), 'Läge C');
  assert.equal(trackText('', 'bus'), '');
});
