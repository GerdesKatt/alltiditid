import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { cleanFeedback, onRequest } from '../functions/api/trafik.js';

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
    request: new Request('https://alltiditid.se/api/trafik?action=feedback', {
      method,
      body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      headers: { 'Content-Type': 'application/json' },
    }),
    env,
    waitUntil() {},
  });

test('synpunkter trimmas och får vara 3–1000 tecken', () => {
  assert.equal(cleanFeedback('  Bra app!  '), 'Bra app!');
  assert.equal(cleanFeedback('ok'), null);
  assert.equal(cleanFeedback(''), null);
  assert.equal(cleanFeedback(null), null);
  assert.equal(cleanFeedback('x'.repeat(1001)), null);
  assert.equal(cleanFeedback('x'.repeat(1000)).length, 1000);
});

test('styrtecken bort, radbrytningar kvar', () => {
  assert.equal(cleanFeedback('rad ett\r\nrad\u0000 två'), 'rad ett\nrad två');
});

test('synpunkten sparas med flik och språk', async () => {
  const db = d1();
  assert.equal((await post({ HISTORY: db }, { text: 'Saknar spårvagn i Lund', tab: 'trafik', lang: 'sv' })).status, 204);
  assert.equal((await post({ HISTORY: db }, { text: 'Nice app', tab: 'okänd', lang: 'en' })).status, 204);
  const rows = db.raw.prepare('SELECT text, tab, lang FROM feedback ORDER BY id').all();
  assert.deepEqual(rows.map((r) => ({ ...r })), [
    { text: 'Saknar spårvagn i Lund', tab: 'trafik', lang: 'sv' },
    { text: 'Nice app', tab: null, lang: 'en' },
  ]);
});

test('felaktiga synpunkter avvisas', async () => {
  const env = { HISTORY: d1() };
  assert.equal((await post(env, { text: 'a' })).status, 400);
  assert.equal((await post(env, 'inte json')).status, 400);
  assert.equal((await post(env, { text: 'y'.repeat(7000) })).status, 400);
  assert.equal((await post(env, null, 'GET')).status, 405);
  assert.equal((await post({}, { text: 'Bra app' })).status, 503);
});
