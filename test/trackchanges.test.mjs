import test from 'node:test';
import assert from 'node:assert/strict';
import { markTrackChanges, TRACK_CHANGE_KEEP_MS } from '../lib/trackChanges.mjs';

test('första hämtningen markerar inget', () => {
  const m = new Map();
  const out = markTrackChanges(m, [{ id: 'a', track: '13a' }], 0);
  assert.equal(out[0].previousTrack, undefined);
});

test('nytt spår ger previousTrack i tio minuter', () => {
  const m = new Map();
  markTrackChanges(m, [{ id: 'a', track: '13a' }], 0);
  let out = markTrackChanges(m, [{ id: 'a', track: '14' }], 1000);
  assert.equal(out[0].previousTrack, '13a');
  out = markTrackChanges(m, [{ id: 'a', track: '14' }], 1000 + TRACK_CHANGE_KEEP_MS - 1);
  assert.equal(out[0].previousTrack, '13a');
  out = markTrackChanges(m, [{ id: 'a', track: '14' }], 1000 + TRACK_CHANGE_KEEP_MS + 1);
  assert.equal(out[0].previousTrack, undefined);
});

test('spår som saknas en gång räknas inte som byte', () => {
  const m = new Map();
  markTrackChanges(m, [{ id: 'a', track: '3' }], 0);
  assert.equal(markTrackChanges(m, [{ id: 'a' }], 1)[0].previousTrack, undefined);
  assert.equal(markTrackChanges(m, [{ id: 'a', track: '3' }], 2)[0].previousTrack, undefined);
});

test('tillbaka till det gamla spåret är också ett byte', () => {
  const m = new Map();
  markTrackChanges(m, [{ id: 'a', track: '3' }], 0);
  markTrackChanges(m, [{ id: 'a', track: '4' }], 1);
  assert.equal(markTrackChanges(m, [{ id: 'a', track: '3' }], 2)[0].previousTrack, '4');
});

test('avgångar som försvunnit glöms', () => {
  const m = new Map();
  markTrackChanges(m, [{ id: 'a', track: '3' }], 0);
  markTrackChanges(m, [{ id: 'b', track: '1' }], 1);
  assert.equal(m.has('a'), false);
});
