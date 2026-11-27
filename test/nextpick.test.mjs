import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNextDeparture } from '../lib/nextPick.mjs';

const d = (mode, min) => ({ transportMode: mode, at: min * 60_000 });
const at = (x) => x.at;

test('tågstation: tåget före bussen utanför', () => {
  assert.equal(pickNextDeparture([d('bus', 1), d('bus', 2), d('train', 4)], at).transportMode, 'train');
});

test('huvudtrafikslaget långt fram: den allra första', () => {
  assert.equal(pickNextDeparture([d('bus', 1), d('train', 45)], at).transportMode, 'bus');
});

test('bara bussar: första bussen', () => {
  const list = [d('bus', 3), d('bus', 5)];
  assert.equal(pickNextDeparture(list, at), list[0]);
  assert.equal(pickNextDeparture([], at), undefined);
});
