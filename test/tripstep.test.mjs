// Nästa steg i Min resa: när man går, vad man kliver på, när man kliver av.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStep, walkWithMargin } from '../lib/tripStep.mjs';

const P = (name, time, track = '') => ({ name, time, rtTime: '', track, date: '2026-11-28' });
const trip = {
  dep: '07:48',
  arr: '11:41',
  depDate: '2026-11-28',
  arrDate: '2026-11-28',
  minutes: 233,
  changes: 2,
  legs: [
    { kind: 'walk', from: P('Hemma', '07:48'), to: P('Herrängens gård', '07:52'), minutes: 4, meters: 300 },
    { kind: 'ride', mode: 'bus', line: 'Buss 144', direction: 'Fruängen', from: P('Herrängens gård', '07:52', 'A'), to: P('Fruängen', '08:02'), minutes: 10, cancelled: false },
    { kind: 'walk', transfer: true, from: P('Fruängen', '08:02'), to: P('Fruängen', '08:06'), minutes: 4, meters: 100 },
    { kind: 'ride', mode: 'subway', line: 'Tunnelbana 14', direction: 'Mörby centrum', from: P('Fruängen', '08:06', '2'), to: P('T-Centralen', '08:24'), minutes: 18, cancelled: false },
    { kind: 'ride', mode: 'train', line: 'Regionaltåg 7063', direction: 'Karlstad C', from: P('Stockholm C', '08:40', '14'), to: P('Karlstad C', '11:41'), minutes: 181, cancelled: false },
  ],
};
const t = (hhmm) => new Date(`2026-11-28T${hhmm}:00`).getTime();

test('promenaden räknas i lugn takt, aldrig kortare än ResRobots', () => {
  assert.equal(walkWithMargin(trip.legs[0]), 5); // 300 / 65
  assert.equal(walkWithMargin(trip.legs[0], true), 6); // 300 / 50
  assert.equal(walkWithMargin({ kind: 'walk', minutes: 4, meters: 0 }), 5); // 4 * 80 / 65
});

test('före resan: gå med marginal, och första linjen', () => {
  const s = nextStep(trip, t('07:30'));
  assert.equal(s.kind, 'before');
  // 07:52 − 5 min gång − 2 min marginal (buss: ingen perrongtid) = 07:45
  assert.equal(s.leaveIn, 15);
  assert.equal(s.margin, 2);
  assert.equal(s.ride.line, 'Buss 144');
  assert.equal(s.later.length, 2);
});

test('bagage ger mer tid', () => {
  // 07:52 − 6 − 4 = 07:42
  assert.equal(nextStep(trip, t('07:30'), { luggage: true }).leaveIn, 12);
});

test('på bussen: kliv av, sedan T-banan', () => {
  const s = nextStep(trip, t('07:56'));
  assert.equal(s.kind, 'riding');
  assert.equal(s.offIn, 6);
  assert.equal(s.next.line, 'Tunnelbana 14');
});

test('vid bytet: nästa tur går om några minuter', () => {
  const s = nextStep(trip, t('08:03'));
  assert.equal(s.kind, 'change');
  assert.equal(s.departsIn, 3);
  assert.equal(s.ride.from.track, '2');
});

test('framme: klart', () => {
  assert.equal(nextStep(trip, t('11:50')).kind, 'done');
});
