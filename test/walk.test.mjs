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

import { paceSample, blendFactor, PACE_FACTOR_MAX } from '../lib/walk.mjs';

test('egen gångtakt: mätning bara när man går mot hållplatsen', () => {
  // 300 m närmare på 3 min: 300*1,25/180 = 2,08 m/s mot normal 80 m/min = 1,33 m/s
  const s = paceSample({ meters: 800, t: 0 }, { meters: 500, t: 180_000 });
  assert.ok(Math.abs(s - 1.5625) < 0.01);
  assert.equal(paceSample({ meters: 800, t: 0 }, { meters: 750, t: 180_000 }), null); // står still
  assert.equal(paceSample({ meters: 2000, t: 0 }, { meters: 500, t: 120_000 }), null); // åker buss
  assert.equal(paceSample({ meters: 800, t: 0 }, { meters: 600, t: 30_000 }), null); // för kort tid
});

test('egen gångtakt: flyttas lite i taget och inom gränserna', () => {
  assert.equal(blendFactor(1, null), 1);
  assert.ok(Math.abs(blendFactor(1, 1.4) - 1.1) < 1e-9);
  let f = 1;
  for (let i = 0; i < 50; i++) f = blendFactor(f, 3);
  assert.ok(f <= PACE_FACTOR_MAX && f > 1.39);
});
