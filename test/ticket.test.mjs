// "Jag har en biljett": resan baklänges från ett bokat tåg eller flyg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alightFor,
  at,
  deadline,
  flightMargin,
  lateMinutes,
  parseTicket,
  pickFeeder,
  ticketTrip,
  trainMargin,
  withAnchorLive,
} from '../lib/ticket.mjs';
import { nextStep } from '../lib/tripStep.mjs';

const D = '2026-11-28';
const P = (name, time, track = '') => ({ name, time, rtTime: '', track, date: D });
const feeder = (dep, arr) => ({
  dep,
  arr,
  depDate: D,
  arrDate: D,
  minutes: 20,
  changes: 0,
  legs: [
    { kind: 'walk', from: P('Hemma', dep), to: P('Herrängens gård', dep), minutes: 4, meters: 300 },
    { kind: 'ride', mode: 'bus', line: 'Buss 144', direction: 'Fruängen', from: P('Herrängens gård', dep, 'A'), to: P('Stockholm C', arr), minutes: 20, cancelled: false },
  ],
});
const anchor = { kind: 'train', number: '7063', label: 'Tåg 7063', date: D, dep: '08:40', from: 'Stockholm C', track: '14', to: 'Karlstad C', arr: '11:41', margin: 20 };

test('tågnummer och flightnummer känns igen', () => {
  assert.deepEqual(parseTicket('7063'), { kind: 'train', number: '7063' });
  assert.deepEqual(parseTicket('tåg 532'), { kind: 'train', number: '532' });
  assert.deepEqual(parseTicket('sk 1415'), { kind: 'flight', number: 'SK1415' });
  assert.deepEqual(parseTicket('DY4321'), { kind: 'flight', number: 'DY4321' });
  assert.deepEqual(parseTicket('d8 2860'), { kind: 'flight', number: 'D82860' });
  assert.equal(parseTicket('Karlstad'), null);
  assert.equal(parseTicket(''), null);
});

test('mer marginal på de stora stationerna', () => {
  assert.equal(trainMargin('Stockholm C'), 20);
  assert.equal(trainMargin('Stockholm Central'), 20);
  assert.equal(trainMargin('Göteborg C'), 20);
  assert.equal(trainMargin('Malmö C'), 20);
  assert.equal(trainMargin('Flemingsberg'), 10);
  assert.equal(trainMargin('Stockholms södra'), 10);
});

test('flyg: boarding, gång till gaten, säkerhetskö, in från stationen och bagage', () => {
  const sas = { airlineIata: 'SK', domestic: true, terminal: '5' };
  const m = flightMargin(sas, 'ARN', { queue: 12 });
  // 25 boarding + 15 gång (terminal 5) + 12 kö + 10 in
  assert.equal(m.minutes, 62);
  assert.equal(m.queueKnown, true);
  // Okänd kö: 15 min. Bagage: 20 min till.
  const bags = flightMargin(sas, 'ARN', { bags: true });
  assert.equal(bags.minutes, 25 + 15 + 15 + 10 + 20);
  assert.equal(bags.queueKnown, false);
  // Ryanair stänger tidigare.
  assert.equal(flightMargin({ airlineIata: 'FR', domestic: false }, 'GOT', { queue: 5 }).minutes, 45 + 10 + 5 + 10);
});

test('en förbindelse tidigare än den som precis räcker, och den sista som reserv', () => {
  const latest = deadline(anchor); // 08:20
  const trips = [feeder('07:42', '08:02'), feeder('07:52', '08:12'), feeder('08:02', '08:22'), feeder('07:32', '07:52')];
  const pick = pickFeeder(trips, latest);
  assert.equal(pick.main.dep, '07:42');
  assert.equal(pick.backup.dep, '07:52');
  assert.equal(pick.tight, false);
});

test('glest mellan turerna: ingen timmes väntan, ta den sista som hinner', () => {
  const pick = pickFeeder([feeder('06:40', '07:10'), feeder('07:40', '08:10')], at(D, '08:20'));
  assert.equal(pick.main.dep, '07:40');
  assert.equal(pick.backup, null);
});

test('inget hinner med hela marginalen: den första, och det sägs', () => {
  const pick = pickFeeder([feeder('08:05', '08:25'), feeder('08:15', '08:35')], at(D, '08:20'));
  assert.equal(pick.main.dep, '08:05');
  assert.equal(pick.tight, true);
});

test('hela resan: förbindelsen, bytet med marginal och tåget sist', () => {
  const trip = ticketTrip(feeder('07:42', '08:02'), anchor);
  assert.equal(trip.dep, '07:42');
  assert.equal(trip.arr, '11:41');
  assert.equal(trip.changes, 1);
  const last = trip.legs[trip.legs.length - 1];
  assert.equal(last.anchor, true);
  assert.equal(last.line, 'Tåg 7063');
  assert.equal(last.from.track, '14');
  const transfer = trip.legs[trip.legs.length - 2];
  assert.equal(transfer.transfer, true);
  assert.equal(transfer.minutes, 20);

  // Resekortet går vidare till tåget efter bussen.
  const step = nextStep(trip, new Date(`${D}T08:10:00`).getTime());
  assert.equal(step.kind, 'change');
  assert.equal(step.ride.line, 'Tåg 7063');
  assert.equal(step.departsIn, 30);
});

test('förseningar följer med på biljetten', () => {
  const trip = withAnchorLive(ticketTrip(feeder('07:42', '08:02'), anchor), { rtTime: '08:52', track: '15' });
  const last = trip.legs[trip.legs.length - 1];
  assert.equal(last.from.rtTime, '08:52');
  assert.equal(last.from.track, '15');
  assert.equal(lateMinutes(last.from.time, last.from.rtTime), 12);
  assert.equal(lateMinutes('23:55', '00:05'), 10);
  // Bussen före rörs inte.
  assert.equal(trip.legs[1].from.rtTime, '');
});

test('avstigning: stationen som stämmer med målet, annars slutstationen', () => {
  const stops = [{ name: 'Stockholm C' }, { name: 'Södertälje Syd' }, { name: 'Katrineholm C' }, { name: 'Karlstad C' }, { name: 'Kil' }];
  assert.equal(alightFor(stops, 'karlstad'), 3);
  assert.equal(alightFor(stops, 'Katrineholm'), 2);
  assert.equal(alightFor(stops, 'Hemma'), 4);
  assert.equal(alightFor(stops, 'Stockholm C', 0), 4);
});
