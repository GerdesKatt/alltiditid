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

import { goesToStop } from '../lib/nextPick.mjs';

test('tåg mot stationen man står på räknas bort', () => {
  assert.equal(goesToStop('Stockholm Centralstation', ['Stockholm C / T-Centralen']), true);
  assert.equal(goesToStop('Stockholm C', ['Stockholm Centralstation']), true);
  assert.equal(goesToStop('Göteborg Centralstation', ['Göteborg C']), true);
  assert.equal(goesToStop('Hallsberg station', ['Stockholm C / T-Centralen']), false);
  assert.equal(goesToStop('Malmö Central', ['Stockholm C / T-Centralen']), false);
  assert.equal(goesToStop('', ['Stockholm C']), false);
});

test('realtid före tidtabell när de går nästan samtidigt', () => {
  const list = [
    { transportMode: 'train', at: 4 * 60_000, hasRealtime: false },
    { transportMode: 'train', at: 6 * 60_000, hasRealtime: true },
  ];
  assert.equal(pickNextDeparture(list, at), list[1]);
  const far = [
    { transportMode: 'train', at: 4 * 60_000, hasRealtime: false },
    { transportMode: 'train', at: 12 * 60_000, hasRealtime: true },
  ];
  assert.equal(pickNextDeparture(far, at), far[0]);
});

test('sameAsBoard: delhållplatsen upprepas inte när den är tavlans egen plats', async () => {
  const { sameAsBoard } = await import('../lib/nextPick.mjs');
  const board = 'Stockholm C / T-Centralen';
  assert.equal(sameAsBoard('T-Centralen', board), true);
  assert.equal(sameAsBoard('Centralstation', board), true);
  assert.equal(sameAsBoard('City', board), false);
  assert.equal(sameAsBoard('Cityterminalen', board), false);
  assert.equal(sameAsBoard('', board), false);
});
