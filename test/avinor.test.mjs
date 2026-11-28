// Flyg från Avinor (Oslo Gardermoen): tolkning av XML-flödet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avinorBoard, parseNames } from '../lib/avinor.mjs';

const xml = `<?xml version="1.0" encoding="iso-8859-1"?>
<airport name="OSL">
  <flights lastUpdate="2026-11-30T08:00:00Z">
    <flight uniqueId="1"><airline>SK</airline><flight_id>SK4035</flight_id><dom_int>D</dom_int>
      <schedule_time>2026-11-30T09:00:00Z</schedule_time><arr_dep>D</arr_dep><airport>BGO</airport>
      <check_in>1 2</check_in><gate>F4</gate></flight>
    <flight uniqueId="2"><airline>DY</airline><flight_id>DY1302</flight_id><dom_int>S</dom_int>
      <schedule_time>2026-11-30T09:30:00Z</schedule_time><arr_dep>D</arr_dep><airport>ARN</airport>
      <gate>E12</gate><status code="E" time="2026-11-30T10:05:00Z"/></flight>
    <flight uniqueId="3"><airline>SK</airline><flight_id>SK1460</flight_id><dom_int>S</dom_int>
      <schedule_time>2026-11-30T09:40:00Z</schedule_time><arr_dep>D</arr_dep><airport>CPH</airport>
      <status code="C" time="2026-11-30T07:00:00Z"/></flight>
    <flight uniqueId="4"><airline>WF</airline><flight_id>WF 123</flight_id><dom_int>D</dom_int>
      <schedule_time>2026-11-30T09:10:00Z</schedule_time><arr_dep>A</arr_dep><airport>TRD</airport></flight>
    <flight uniqueId="5"><airline>SK</airline><flight_id>SK4001</flight_id><dom_int>D</dom_int>
      <schedule_time>2026-11-30T07:00:00Z</schedule_time><arr_dep>D</arr_dep><airport>TRD</airport>
      <status code="D" time="2026-11-30T07:05:00Z"/></flight>
  </flights>
</airport>`;

const names = {
  airports: parseNames('<airportNames><airportName code="BGO" name="Bergen"/><airportName code="ARN" name="Stockholm-Arlanda"/></airportNames>', 'airportName'),
  airlines: parseNames('<airlineNames><airlineName code="SK" name="SAS"/><airlineName code="DY" name="Norwegian"/></airlineNames>', 'airlineName'),
};

test('namnlistor', () => {
  assert.equal(names.airports.BGO, 'Bergen');
  assert.equal(names.airlines.DY, 'Norwegian');
});

test('avgångar: UTC blir svensk/norsk tid, gate, ny tid och inställt', () => {
  const list = avinorBoard(xml, 'departures', '2026-11-30T09:30', names);
  assert.deepEqual(list.map((f) => f.flightId), ['SK4035', 'SK1460', 'DY1302']);
  const bgo = list[0];
  assert.equal(bgo.scheduledAt, '2026-11-30T10:00');
  assert.equal(bgo.place, 'Bergen');
  assert.equal(bgo.airline, 'SAS');
  assert.equal(bgo.gate, 'F4');
  assert.equal(bgo.checkIn, '1 2');
  assert.equal(bgo.domestic, true);
  const dy = list.find((f) => f.flightId === 'DY1302');
  assert.equal(dy.status, 'delayed');
  assert.equal(dy.delayMinutes, 35);
  assert.equal(dy.newTime, '11:05');
  assert.equal(dy.place, 'Stockholm-Arlanda');
  assert.equal(list.find((f) => f.flightId === 'SK1460').status, 'cancelled');
  assert.equal(list.find((f) => f.flightId === 'SK1460').place, 'CPH');
});

test('ankomster för sig, mellanslag i flightnumret tas bort', () => {
  const list = avinorBoard(xml, 'arrivals', '2026-11-30T09:30', names);
  assert.deepEqual(list.map((f) => f.flightId), ['WF123']);
  assert.equal(list[0].gate, undefined);
});
