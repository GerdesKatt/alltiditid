// Gångtid och beskedet "Gå nu / Gå om X min / Hinner inte".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceTo, platformMinutes, walkMinutes, walkVerdict } from '../lib/walk.mjs';

test('fågelvägen Slussen–Gamla stan är ungefär 500 m', () => {
  const m = distanceTo({ lat: 59.3196, lon: 18.0723 }, { lat: 59.3233, lon: 18.0675 });
  assert.ok(m > 400 && m < 600, String(m));
});

test('saknade koordinater ger inget avstånd', () => {
  assert.equal(distanceTo(null, { lat: 59, lon: 18 }), null);
  assert.equal(distanceTo({ lat: 59, lon: 18 }, { lat: undefined, lon: 18 }), null);
});

test('gångtid med omväg, avrundad uppåt och per takt', () => {
  assert.equal(walkMinutes(400), 7); // 400 * 1,25 / 80 = 6,25
  assert.equal(walkMinutes(400, 'brisk'), 6); // 5,26
  assert.equal(walkMinutes(400, 'calm'), 8); // 7,69
  assert.equal(walkMinutes(5), 1);
});

test('perrongtid per trafikslag', () => {
  assert.equal(platformMinutes('subway'), 2);
  assert.equal(platformMinutes('bus'), 0);
  assert.equal(platformMinutes(undefined), 0);
});

test('beskedet följer marginalen', () => {
  assert.deepEqual(walkVerdict(10, 5, 2), { kind: 'relax', leaveIn: 3 });
  assert.equal(walkVerdict(9, 5, 2).kind, 'go'); // 2 min marginal
  assert.equal(walkVerdict(7, 5, 2).kind, 'go'); // precis
  assert.equal(walkVerdict(6, 5, 2).kind, 'missed');
  assert.equal(walkVerdict(20, 5, 0).leaveIn, 15);
});
