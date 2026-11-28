import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSameTrains } from '../lib/trains.mjs';

// Riktiga rader från Stockholm C 28 november 2026, 11:05 (appens historik).
const row = (o) => ({ transportMode: 'train', hasRealtime: true, status: 'on-time', track: '', deviation: '', ...o });
const board = [
  row({ id: 'a', line: 'Mälartåg 928', trainNumber: '928', destination: 'Uppsala central', operator: 'Mälartåg', _scheduledLocal: '2026-11-28T11:11', expectedAt: '2026-11-28T11:11' }),
  row({ id: 'p', line: 'Pendeltåg 43', trainNumber: '43', transportMode: 'commuter', destination: 'Kungsängen', _scheduledLocal: '2026-11-28T11:11', expectedAt: '2026-11-28T11:11' }),
  row({ id: 'b', line: 'Mälartåg 928', trainNumber: '928', destination: 'Uppsala C', operator: 'Mälardalstrafik AB', track: 'Spår 12', _scheduledLocal: '2026-11-28T11:11', expectedAt: '2026-11-28T11:12' }),
  row({ id: 'c', line: 'Tåg 171', trainNumber: '171', destination: 'Hallsberg station', operator: 'SJ AB', _scheduledLocal: '2026-11-28T11:14', expectedAt: '2026-11-28T11:14', track: 'Spår 14' }),
  row({ id: 'd', line: 'SJ Regional 171', trainNumber: '171', destination: 'Hallsberg', operator: 'SJ', _scheduledLocal: '2026-11-28T11:14', expectedAt: '2026-11-28T11:15' }),
];

test('samma tåg från två källor blir en rad, på den förstas plats', () => {
  const out = mergeSameTrains(board);
  assert.deepEqual(out.map((d) => d.id), ['b', 'p', 'd']);
});

test('den senaste väntade tiden vinner, spåret tas från den andra raden', () => {
  const out = mergeSameTrains(board);
  const t171 = out.find((d) => d.trainNumber === '171');
  assert.equal(t171.expectedAt, '2026-11-28T11:15');
  assert.equal(t171.line, 'SJ Regional 171');
  assert.equal(t171.track, 'Spår 14');
});

test('realtid går före tidtabell, och det tydligare linjenamnet behålls', () => {
  const out = mergeSameTrains([
    row({ id: 'x', line: 'SJ Regional 171', operator: 'SJ', trainNumber: '171', hasRealtime: false, _scheduledLocal: '2026-11-28T11:14', expectedAt: '2026-11-28T11:20' }),
    row({ id: 'y', line: 'Tåg 171', operator: 'SJ AB', trainNumber: '171', _scheduledLocal: '2026-11-28T11:14', expectedAt: '2026-11-28T11:14' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'y');
  assert.equal(out[0].line, 'SJ Regional 171');
  assert.equal(out[0].operator, 'SJ');
});

test('pendeltåg, olika tider och samma nummer i morgon slås inte ihop', () => {
  const list = [
    row({ id: '1', line: 'Pendeltåg 41', trainNumber: '41', transportMode: 'commuter', _scheduledLocal: '2026-11-28T11:15' }),
    row({ id: '2', line: 'Pendeltåg 41', trainNumber: '41', transportMode: 'commuter', _scheduledLocal: '2026-11-28T11:15' }),
    row({ id: '3', line: 'Tåg 70', trainNumber: '70', _scheduledLocal: '2026-11-28T11:18' }),
    row({ id: '4', line: 'Tåg 70', trainNumber: '70', _scheduledLocal: '2026-11-29T11:18' }),
  ];
  assert.equal(mergeSameTrains(list), list);
});
