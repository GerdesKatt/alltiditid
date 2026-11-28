// Anonyma användarräkningar (lib/usage.mjs) och statistiksidan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageSignals, weekStart, weeklyStats } from '../lib/usage.mjs';
import { statsHtml, isoWeek } from '../lib/statsPage.mjs';
import { onRequest } from '../functions/api/trafik.js';

const at = (s) => new Date(s).getTime();

test('veckan börjar på måndag', () => {
  assert.equal(weekStart('2026-11-28'), '2026-11-23');
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.equal(weekStart('2026-11-22'), '2026-11-16');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
  assert.equal(isoWeek('2026-11-23'), 48);
  assert.equal(isoWeek('2026-12-28'), 53);
});

test('första besöket någonsin är ny, dagens och veckans första', () => {
  assert.deepEqual(usageSignals([], at('2026-11-28T10:00:00+01:00')), { firstToday: true, firstThisWeek: true, week: 'ny' });
});

test('samma dag igen räknas inte', () => {
  const s = usageSignals([{ t: at('2026-11-28T08:00:00+01:00') }], at('2026-11-28T18:00:00+01:00'));
  assert.equal(s.firstToday, false);
  assert.equal(s.firstThisWeek, false);
});

test('ny dag samma vecka: daglig men inte veckans första', () => {
  const s = usageSignals([{ t: at('2026-11-24T08:00:00+01:00') }], at('2026-11-28T08:00:00+01:00'));
  assert.equal(s.firstToday, true);
  assert.equal(s.firstThisWeek, false);
});

test('var här förra veckan: återkommande', () => {
  const s = usageSignals([{ t: at('2026-11-20T08:00:00+01:00') }], at('2026-11-23T07:00:00+01:00'));
  assert.deepEqual(s, { firstToday: true, firstThisWeek: true, week: 'ater' });
});

test('var här för länge sedan men inte förra veckan: tillbaka', () => {
  const s = usageSignals([{ t: at('2026-11-02T08:00:00+01:00') }], at('2026-11-28T08:00:00+01:00'));
  assert.equal(s.week, 'tillbaka');
});

test('midnatt räknas i svensk tid', () => {
  // 23:30 UTC söndag = 00:30 måndag i Sverige: ny vecka.
  const s = usageSignals([{ t: at('2026-11-22T12:00:00+01:00') }], at('2026-11-22T23:30:00Z'));
  assert.equal(s.firstThisWeek, true);
  assert.equal(s.week, 'ater');
});

test('veckosummor ur dygnsrader', () => {
  const rows = [
    { day: '2026-11-23', name: 'anvandare', label: 'dag_webb', n: 3 },
    { day: '2026-11-23', name: 'anvandare', label: 'dag_app', n: 1 },
    { day: '2026-11-24', name: 'anvandare', label: 'dag_webb', n: 2 },
    { day: '2026-11-23', name: 'anvandare', label: 'vecka_ny', n: 2 },
    { day: '2026-11-24', name: 'anvandare', label: 'vecka_ater', n: 2 },
    { day: '2026-11-23', name: 'oppning', label: 'app', n: 4 },
    { day: '2026-11-23', name: 'oppning', label: 'webb', n: 6 },
    { day: '2026-11-23', name: 'nyckel', label: 'sok', n: 5 },
    { day: '2026-11-23', name: 'nyckel', label: 'okand', n: 9 },
    { day: '2026-11-16', name: 'anvandare', label: 'vecka_ny', n: 1 },
  ];
  const [w, prev] = weeklyStats(rows, [{ day: '2026-11-25', n: 2 }]);
  assert.equal(w.week, '2026-11-23');
  assert.equal(w.users, 4);
  assert.equal(w.returning, 2);
  assert.equal(w.dailyAvg, 3);
  assert.equal(w.appShare, 17);
  assert.equal(w.opens, 10);
  assert.deepEqual(w.actions, { sok: 5, tyck_till: 2 });
  assert.equal(prev.users, 1);
  const html = statsHtml([w, prev], '2026-11-28 15:00');
  assert.match(html, /v\. 48/);
  assert.match(html, /noindex/);
});

test('statistiksidan kräver rätt nyckel', async () => {
  const env = { STATS_KEY: 'hemlig-nyckel-123' };
  const call = (k) => onRequest({ request: new Request(`https://alltiditid.se/api/trafik?action=stats&k=${k}`), env, waitUntil() {} });
  assert.equal((await call('fel-nyckel-1234')).status, 404);
  const ok = await call('hemlig-nyckel-123');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
  assert.match(await ok.text(), /Användare denna vecka/);
});

test('de nya händelserna tas emot', async () => {
  const runs = [];
  const db = {
    prepare(sql) {
      return {
        bind: (...args) => ({ run: async () => runs.push([sql, args]), first: async () => null }),
        run: async () => runs.push([sql, []]),
        first: async () => null,
      };
    },
  };
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=event', { method: 'POST', body: JSON.stringify({ n: 'anvandare', v: 0, l: 'vecka_ater' }) }),
    env: { HISTORY: db },
    waitUntil() {},
  });
  assert.equal(res.status, 204);
  assert.ok(runs.some(([sql, args]) => sql.startsWith('INSERT INTO events') && args.includes('vecka_ater')));
});
