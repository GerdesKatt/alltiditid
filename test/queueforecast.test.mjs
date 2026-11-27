// Köprognosen: dagtyper (röda dagar, resdagar, lov, sommar) och snitten per timme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayClass, easterSunday, holidayName, isoWeek } from '../lib/dayType.mjs';
import { countDepartures, departuresByHour, typicalDay } from '../lib/queueForecast.mjs';

test('påskdagen räknas rätt', () => {
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
  assert.equal(easterSunday(2025), '2025-04-20');
});

test('röda dagar och aftnar', () => {
  assert.equal(holidayName('2026-04-03'), 'Långfredagen');
  assert.equal(holidayName('2026-05-14'), 'Kristi himmelsfärdsdag');
  assert.equal(holidayName('2026-06-19'), 'Midsommarafton');
  assert.equal(holidayName('2026-10-31'), 'Alla helgons dag');
  assert.equal(holidayName('2026-12-24'), 'Julafton');
  assert.equal(holidayName('2026-11-30'), null);
});

test('dagens klass', () => {
  assert.equal(dayClass('2026-12-25'), 'helgdag');
  assert.equal(dayClass('2026-12-23'), 'resdag'); // dagen före julafton
  assert.equal(dayClass('2026-05-13'), 'resdag'); // onsdagen före Kristi himmelsfärd
  assert.equal(dayClass('2026-05-15'), 'resdag'); // klämdagen
  assert.equal(dayClass('2026-04-02'), 'resdag'); // skärtorsdagen
  assert.equal(dayClass('2026-07-13'), 'sommar');
  assert.equal(dayClass('2026-02-23'), 'lov'); // sportlov v. 9
  assert.equal(dayClass('2026-10-27'), 'lov'); // höstlov v. 44
  assert.equal(dayClass('2026-12-28'), 'lov'); // jullov
  assert.equal(dayClass('2026-11-30'), 'vanlig');
  assert.equal(isoWeek('2026-02-23'), 9);
});

// Vanliga måndagar i november–december 2026.
const mondays = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'];
const row = (day, hour, minutes, queue = 'T5') => ({ queue, fast_track: 0, day, hour, minutes });

test('typisk kötid: median av liknande dagar, med spann', () => {
  const rows = [row(mondays[0], 9, 10), row(mondays[1], 9, 20), row(mondays[2], 9, 30), row(mondays[3], 9, 40)];
  const f = typicalDay(rows, '2026-11-30');
  assert.equal(f.dayClass, 'vanlig');
  const cell = f.queues[0].hours.find((c) => c.hour === 9);
  assert.equal(cell.typical, 25);
  assert.equal(cell.low, 18);
  assert.equal(cell.high, 33);
  assert.equal(cell.days, 4);
  assert.equal(cell.basis, 'same');
});

test('för få dagar ger ingen siffra, och framtida mätningar räknas inte', () => {
  const rows = [row(mondays[0], 9, 10), row(mondays[1], 9, 20), row('2026-12-07', 9, 99)];
  const cell = typicalDay(rows, '2026-11-30').queues[0].hours.find((c) => c.hour === 9);
  assert.equal(cell.typical, null);
});

test('en lovmåndag använder lovdagar före vanliga måndagar', () => {
  // Sportlovet 2026: v. 7–10. Tre lovmåndagar med långa köer, fyra vanliga med korta.
  const lov = ['2026-02-09', '2026-02-16', '2026-02-23'];
  const rows = [...lov.map((d) => row(d, 7, 45)), ...['2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02'].map((d) => row(d, 7, 5))];
  const cell = typicalDay(rows, '2026-03-02').queues[0].hours.find((c) => c.hour === 7);
  assert.equal(cell.typical, 45);
  assert.equal(cell.basis, 'same');
  // En vanlig måndag efter lovet tar de vanliga.
  const normal = typicalDay(rows, '2026-03-09').queues[0].hours.find((c) => c.hour === 7);
  assert.equal(normal.typical, 5);
});

test('saknas samma veckodag faller prognosen tillbaka på samma sorts dag', () => {
  // Tisdag, onsdag, torsdag (vanliga vardagar) men inga måndagar.
  const rows = ['2026-11-24', '2026-11-25', '2026-11-26'].map((d) => row(d, 8, 12));
  const cell = typicalDay(rows, '2026-11-30').queues[0].hours.find((c) => c.hour === 8);
  assert.equal(cell.typical, 12);
  assert.equal(cell.basis, 'group');
});

test('avgångar per timme och "fler än vanligt"', () => {
  const flights = [
    { scheduledAt: '2026-11-30T06:05' },
    { scheduledAt: '2026-11-30T06:40' },
    { scheduledAt: '2026-11-30T07:10' },
    { scheduledAt: '2026-12-01T06:00' },
  ];
  assert.deepEqual(countDepartures(flights, '2026-11-30'), [
    { hour: 6, n: 2 },
    { hour: 7, n: 1 },
  ]);
  const rows = [
    { day: '2026-11-16', hour: 6, n: 10 },
    { day: '2026-11-23', hour: 6, n: 10 },
    { day: '2026-11-30', hour: 6, n: 16 },
    { day: '2026-11-30', hour: 7, n: 9 },
  ];
  const out = departuresByHour(rows, '2026-11-30');
  const six = out.find((d) => d.hour === 6);
  assert.deepEqual(six, { hour: 6, n: 16, usual: 10, busy: true });
  assert.equal(out.find((d) => d.hour === 7).busy, false);
  assert.deepEqual(departuresByHour(rows, '2026-12-07'), []);
});
