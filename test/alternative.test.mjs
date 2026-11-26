import test from 'node:test';
import assert from 'node:assert/strict';
import { alternativeFor } from '../lib/alternative.mjs';
import { mergeSameName, mergeStops } from '../lib/stationGroups.mjs';

const dep = (id, destination, expectedAt, extra = {}) => ({
  id, line: 'Tåg', destination, expectedAt, status: 'on-time', transportMode: 'train', ...extra,
});

test('inställt: nästa avgång till samma mål, samma trafikslag först', () => {
  const cancelled = dep('a', 'Stockholm Central', '2026-11-26T16:12', { status: 'cancelled' });
  const list = [
    cancelled,
    dep('b', 'Uppsala C', '2026-11-26T16:15'),
    dep('c', 'Södertälje C', '2026-11-26T16:24', { transportMode: 'commuter', viaStops: ['Stockholm City', 'Stockholm C'] }),
    dep('d', 'Stockholm C', '2026-11-26T16:43'),
  ];
  assert.equal(alternativeFor(cancelled, list).id, 'd');
  // Utan tåg mot samma mål: pendeltåget som passerar.
  assert.equal(alternativeFor(cancelled, list.slice(0, 3)).id, 'c');
  // Avgångar före den inställda räknas inte, och en avgång som inte är inställd har inget alternativ.
  assert.equal(alternativeFor(cancelled, [dep('e', 'Stockholm C', '2026-11-26T16:00'), cancelled]), null);
  assert.equal(alternativeFor(list[1], list), null);
});

test('sökträffar: samma plats slås ihop, andra städer lämnas', () => {
  const odenplan = [
    { id: '740098559', name: 'Odenplan', modes: ['Tåg', 'T-bana', 'Buss'] },
    { id: '740021013', name: 'Odenplan T-bana', modes: ['T-bana', 'Buss'] },
    { id: '740001618', name: 'Stockholm Odenplan station', modes: ['Tåg'] },
  ];
  assert.deepEqual(mergeStops(odenplan).map((s) => s.id), ['740098559']);
  const kungs = [
    { id: '740098495', name: 'Kungsträdgården', modes: ['T-bana', 'Buss'] },
    { id: '740037355', name: 'Stockholm Kungsträdgården', modes: ['Spårvagn', 'Buss'] },
    { id: '740021659', name: 'Kungsträdgården T-bana', modes: ['T-bana'] },
    { id: '740073532', name: 'Kungsträdgården', modes: ['Buss'] },
  ];
  const merged = mergeSameName(kungs);
  // Spårvagnen tas med genom sitt id; den likadant namngivna bussen (troligen annan stad) står kvar.
  assert.deepEqual(merged.map((s) => s.id), ['740098495,740037355', '740073532']);
  assert.deepEqual(merged[0].modes, ['T-bana', 'Buss', 'Spårvagn']);
  const brunns = [
    { id: '740037435', name: 'Brunnsparken', modes: ['Buss'] },
    { id: '740025573', name: 'Brunnsparken', modes: ['Buss'] },
  ];
  assert.deepEqual(mergeSameName(brunns), brunns);
});

import { board } from './helpers.mjs';

test('API: händelser räknas per dygn, okända namn och för stora svar ignoreras', async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return { run: async () => calls.push([sql, args]), first: async () => ({ n: 1 }) };
        },
        run: async () => calls.push([sql, []]),
      };
    },
  };
  const { onRequest } = await import('../functions/api/trafik.js');
  const post = (body) =>
    onRequest({ request: new Request('https://x/api/trafik?action=event', { method: 'POST', body }), env: { HISTORY: db } });
  assert.equal((await post(JSON.stringify({ n: 'forsta_avgang', v: 640 }))).status, 204);
  const insert = calls.find(([sql]) => sql.startsWith('INSERT INTO events'));
  assert.deepEqual(insert[1].slice(1), ['forsta_avgang', '', 640, 1]);
  const before = calls.length;
  await post(JSON.stringify({ n: 'hemligt', v: 1 }));
  await post(JSON.stringify({ n: 'funktion', l: 'Inte OK!' }));
  await post('x'.repeat(400));
  assert.equal(calls.length, before);
  const get = await onRequest({ request: new Request('https://x/api/trafik?action=event'), env: { HISTORY: db } });
  assert.equal(get.status, 405);
  void board;
});
