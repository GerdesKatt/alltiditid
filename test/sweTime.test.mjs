// Svensk tid oberoende av telefonens tidszon (lib/sweTime.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseStockholm, stockholmClock, stockholmDay, stockholmHour, stockholmMinute } from '../lib/sweTime.mjs';

const lib = fileURLToPath(new URL('../lib/sweTime.mjs', import.meta.url));

test('vintertid: 08:15 i Stockholm är 07:15 UTC', () => {
  assert.equal(parseStockholm('2026-11-27T08:15'), Date.UTC(2026, 10, 27, 7, 15));
});

test('sommartid: 08:15 i Stockholm är 06:15 UTC', () => {
  assert.equal(parseStockholm('2026-07-01T08:15'), Date.UTC(2026, 6, 1, 6, 15));
});

test('runt bytet till vintertid (25 okt 2026) blir det rätt på båda sidor', () => {
  assert.equal(parseStockholm('2026-10-25T01:30'), Date.UTC(2026, 9, 24, 23, 30));
  assert.equal(parseStockholm('2026-10-25T04:00'), Date.UTC(2026, 9, 25, 3, 0));
});

test('runt bytet till sommartid (29 mars 2026) blir det rätt på båda sidor', () => {
  assert.equal(parseStockholm('2026-03-29T01:30'), Date.UTC(2026, 2, 29, 0, 30));
  assert.equal(parseStockholm('2026-03-29T03:30'), Date.UTC(2026, 2, 29, 1, 30));
});

test('fel format ger null', () => {
  assert.equal(parseStockholm(''), null);
  assert.equal(parseStockholm(undefined), null);
  assert.equal(parseStockholm('08:15'), null);
});

test('formattering tillbaka till svensk tid', () => {
  const ms = Date.UTC(2026, 10, 27, 23, 5); // 00:05 den 28:e i Stockholm
  assert.equal(stockholmMinute(ms), '2026-11-28T00:05');
  assert.equal(stockholmDay(ms), '2026-11-28');
  assert.equal(stockholmHour(ms), 0);
  assert.equal(stockholmClock(ms), '00:05');
  assert.equal(stockholmMinute(parseStockholm('2026-11-27T21:57')), '2026-11-27T21:57');
});

for (const tz of ['Europe/Helsinki', 'Europe/London', 'America/New_York', 'Asia/Tokyo', 'UTC']) {
  test(`samma svar med telefonen i ${tz}`, () => {
    const code = `import(${JSON.stringify(lib)}).then((m) => console.log(JSON.stringify([
      m.parseStockholm('2026-11-27T08:15'),
      m.stockholmMinute(Date.UTC(2026, 10, 27, 23, 5)),
      m.stockholmHour(Date.UTC(2026, 6, 1, 6, 15)),
    ])))`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    });
    assert.deepEqual(JSON.parse(out), [Date.UTC(2026, 10, 27, 7, 15), '2026-11-28T00:05', 8]);
  });
}
