import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequest, cleanFeedback, cleanFeedbackPage } from '../functions/api/trafik.js';

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

test('synpunkter rensas', () => {
  assert.equal(cleanFeedback('  Bra sajt!  '), 'Bra sajt!');
  assert.equal(cleanFeedback('a\u0000b\n\n\n\nc'), 'ab\n\nc');
  assert.equal(cleanFeedback(' '), null);
  assert.equal(cleanFeedback('x'.repeat(1500)).length, 1000);
  assert.equal(cleanFeedbackPage('/t-centralen#avgangstavla'), '/t-centralen#avgangstavla');
  assert.equal(cleanFeedbackPage('/a?email=x@y.se'), '');
  assert.equal(cleanFeedbackPage('https://evil.se'), '');
});

test('synpunkten sparas med sida och språk, och kan läsas i morgonkollen', async () => {
  const db = d1();
  const env = { HISTORY: db };
  assert.equal((await post(env, { text: 'Saknar Sjöbo busstation', page: '/sjobo', lang: 'sv' })).status, 204);
  assert.equal((await post(env, { text: 'Love it', page: '/', lang: 'en' })).status, 204);
  const rows = db.raw
    .prepare("SELECT page, lang, text FROM feedback WHERE created >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day') ORDER BY created")
    .all();
  assert.deepEqual(
    rows.map((r) => ({ ...r })),
    [
      { page: '/sjobo', lang: 'sv', text: 'Saknar Sjöbo busstation' },
      { page: '/', lang: 'en', text: 'Love it' },
    ]
  );
});

test('gamla synpunkter raderas efter 12 månader', async () => {
  const db = d1();
  const env = { HISTORY: db };
  await post(env, { text: 'första', page: '/' });
  db.raw.prepare("UPDATE feedback SET created = '2020-01-01T00:00:00.000Z'").run();
  await post(env, { text: 'andra', page: '/' });
  assert.deepEqual(db.raw.prepare('SELECT text FROM feedback').all().map((r) => r.text), ['andra']);
});

test('fel och robotar avvisas', async () => {
  const db = d1();
  const env = { HISTORY: db };
  assert.equal((await post(env, { text: ' ' })).status, 400);
  assert.equal((await post(env, 'inte json')).status, 400);
  assert.equal((await post(env, { text: 'y'.repeat(5000) })).status, 400);
  assert.equal((await post(env, null, 'GET')).status, 405);
  assert.equal((await post({}, { text: 'hej' })).status, 503);
  // Fällan: svarar som vanligt men sparar inget.
  assert.equal((await post(env, { text: 'köp billigt', webb: 'http://spam' })).status, 204);
  const count = db.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'feedback'").get().n;
  assert.equal(count, 0);
});
