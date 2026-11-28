import test from 'node:test';
import assert from 'node:assert/strict';
import { rainSoon } from '../lib/rain.mjs';

const now = Date.parse('2026-11-28T10:20:00Z');

test('rainSoon: gammalt format med parameterlista', () => {
  const json = { timeSeries: [
    { validTime: '2026-11-28T10:00:00Z', parameters: [{ name: 'pmean', values: [3] }] },
    { validTime: '2026-11-28T11:00:00Z', parameters: [{ name: 'pmean', values: [0.6] }, { name: 'pcat', values: [3] }] },
  ] };
  assert.deepEqual(rainSoon(json, now), { wet: true, snow: false, mm: 0.6 });
});

test('rainSoon: nytt format med data-objekt', () => {
  const json = { timeSeries: [{ time: '2026-11-28T11:00:00Z', data: { precipitation_amount_mean: 0.1, predominant_precipitation_type_at_surface: 0 } }] };
  assert.deepEqual(rainSoon(json, now), { wet: false, snow: false, mm: 0.1 });
});

test('rainSoon: snö, och oläsbart svar', () => {
  const json = { timeSeries: [{ time: '2026-11-28T11:00:00Z', data: { precipitation_amount_mean: 1.2, predominant_precipitation_type_at_surface: 1 } }] };
  assert.equal(rainSoon(json, now).snow, true);
  assert.equal(rainSoon({}, now), null);
  assert.equal(rainSoon({ timeSeries: [{ time: '2026-11-28T11:00:00Z', data: {} }] }, now), null);
});
