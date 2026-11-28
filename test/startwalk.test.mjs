// Gå hela vägen till Fruängen eller ta bussen från Herrängens gård: beror på när bussen går.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { longFirstWalk, mergeStarts, minusMinutes, startAlternative, withStartWalk } from '../lib/plan.mjs';

const P = (name, time) => ({ name, time, rtTime: '', track: '', date: '2026-11-28' });
const ride = (line, from, dep, to, arr, mode = 'bus') => ({ kind: 'ride', mode, line, direction: to, from: P(from, dep), to: P(to, arr), minutes: 10, cancelled: false });
const train = ride('Snabbtåg 627', 'Stockholm C', '09:35', 'Karlstad C', '12:20', 'train');
const walkTrip = {
  dep: '08:30', arr: '12:20', depDate: '2026-11-28', arrDate: '2026-11-28', minutes: 230, changes: 1,
  legs: [{ kind: 'walk', from: P('Hemma', '08:30'), to: P('Fruängen', '08:52'), minutes: 22, meters: 1500 }, ride('Tunnelbana 14', 'Fruängen', '08:55', 'T-Centralen', '09:14', 'subway'), train],
};
const fromStop = (busDep, trainRide = train) => ({
  dep: busDep, arr: trainRide.to.time, depDate: '2026-11-28', arrDate: '2026-11-28', minutes: 200, changes: 2,
  legs: [ride('Buss 144', 'Herrängens gård', busDep, 'Fruängen', minusMinutes(busDep, -8)), ride('Tunnelbana 14', 'Fruängen', '08:55', 'T-Centralen', '09:14', 'subway'), trainRide],
});
const walk = { from: P('Hemma', ''), stopName: 'Herrängens gård', meters: 200, minutes: 4 };

test('lång promenad först känns igen, kort inte', () => {
  assert.ok(longFirstWalk(walkTrip));
  assert.equal(longFirstWalk(fromStop('08:44')), null);
});

test('minuter bakåt och framåt', () => {
  assert.equal(minusMinutes('07:52', 4), '07:48');
  assert.equal(minusMinutes('23:58', -5), '00:03');
});

test('bussen till samma tåg: gå hemifrån senare, bussen först', () => {
  const bus = withStartWalk([fromStop('08:44')], walk);
  assert.equal(bus[0].dep, '08:40');
  assert.equal(bus[0].legs[0].to.name, 'Herrängens gård');
  const merged = mergeStarts([walkTrip], bus);
  assert.equal(merged[0].legs[1].line, 'Buss 144');
  // Och promenaden finns kvar som alternativ på kortet.
  assert.equal(startAlternative(walkTrip, merged).line, 'Buss 144');
});

test('bussen hinner bara ett senare tåg: gå först', () => {
  const later = ride('Snabbtåg 629', 'Stockholm C', '11:35', 'Karlstad C', '14:20', 'train');
  const merged = mergeStarts([walkTrip], withStartWalk([fromStop('08:44', later)], walk));
  assert.equal(merged[0], walkTrip);
  assert.equal(startAlternative(walkTrip, merged), null);
});
