import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequest, validWaitlistEmail } from '../functions/api/trafik.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  const statement = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => statement(sql, a),
    run: async () => db.prepare(sql).run(...args),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { raw: db, prepare: (sql) => statement(sql), batch: async (s) => s.map((x) => db.prepare(x.sql).run(...x.args)) };
}

const post = (env, body, method = 'POST') =>
  onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=waitlist', {
      method,
      body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      headers: { 'Content-Type': 'application/json' },
    }),
    env,
    waitUntil() {},
  });

test('e-postadresser kontrolleras', () => {
  assert.equal(validWaitlistEmail(' Anna@Exempel.SE '), 'anna@exempel.se');
  assert.equal(validWaitlistEmail('anna@exempel'), null);
  assert.equal(validWaitlistEmail('anna exempel@a.se'), null);
  assert.equal(validWaitlistEmail('<a>@b.se'), null);
  assert.equal(validWaitlistEmail(''), null);
  assert.equal(validWaitlistEmail(`${'a'.repeat(250)}@b.se`), null);
});

test('anmälan sparas, och samma adress igen uppdaterar valet', async () => {
  const db = d1();
  const env = { HISTORY: db };
  assert.equal((await post(env, { email: 'anna@exempel.se', plan: 'month', lang: 'sv' })).status, 204);
  assert.equal((await post(env, { email: 'ANNA@exempel.se', plan: 'year', lang: 'en' })).status, 204);
  const rows = db.raw.prepare('SELECT email, plan, lang FROM waitlist').all();
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ email: 'anna@exempel.se', plan: 'year', lang: 'en' }]);
});

test('felaktiga anmälningar avvisas', async () => {
  const env = { HISTORY: d1() };
  assert.equal((await post(env, { email: 'inte-en-adress', plan: 'month' })).status, 400);
  assert.equal((await post(env, { email: 'a@b.se', plan: 'gratis-för-alltid' })).status, 400);
  assert.equal((await post(env, 'inte json')).status, 400);
  assert.equal((await post(env, { email: 'a@b.se', plan: 'free', x: 'y'.repeat(700) })).status, 400);
  assert.equal((await post(env, null, 'GET')).status, 405);
  assert.equal((await post({}, { email: 'a@b.se', plan: 'free' })).status, 503);
});

test('händelsen bevakning räknas', async () => {
  const db = d1();
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=event', {
      method: 'POST',
      body: JSON.stringify({ n: 'bevakning', v: 0, l: 'oppnad' }),
    }),
    env: { HISTORY: db },
    waitUntil() {},
  });
  assert.equal(res.status, 204);
  const row = db.raw.prepare("SELECT n FROM events WHERE name = 'bevakning' AND label = 'oppnad'").get();
  assert.equal(row.n, 1);
});

test('händelsen flygflik räknas', async () => {
  const db = d1();
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=event', {
      method: 'POST',
      body: JSON.stringify({ n: 'flygflik', v: 0, l: '' }),
    }),
    env: { HISTORY: db },
    waitUntil() {},
  });
  assert.equal(res.status, 204);
  const row = db.raw.prepare("SELECT n FROM events WHERE name = 'flygflik'").get();
  assert.equal(row.n, 1);
});
