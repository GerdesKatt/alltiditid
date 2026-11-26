// Hållplatssidorna: urval, adresser och grannar ur Trafiklabs stops/list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStopList, slugify } from '../lib/stopList.mjs';

const g = (id, name, daily, modes, lat, lon, child = name) => ({
  id, name, average_daily_stop_times: daily, transport_modes: modes,
  stops: [{ id: id + 'x', name: child, lat, lon }],
});

test('slugify ger korta, läsbara adresser', () => {
  assert.equal(slugify('Göteborg Centralstation'), 'goteborg-centralstation');
  assert.equal(slugify('Malmö C (Malmö kn)'), 'malmo-c-malmo-kn');
  assert.equal(slugify('Södra Ängby'), 'sodra-angby');
  assert.equal(slugify('Ytterby/Kungälv'), 'ytterby-kungalv');
});

test('de mest trafikerade väljs, utan trafiklösa och dubbletter', () => {
  const list = buildStopList([
    g('740000001', 'Stockholm Centralstation', 1400, ['TRAIN'], 59.33, 18.058, 'Stockholm, Centralstation'),
    g('740021705', 'Gullmarsplan', 3400, ['METRO', 'BUS'], 59.299, 18.08, 'Stockholm, Gullmarsplan'),
    g('740099999', 'Gullmarsplan', 50, ['BUS'], 59.2991, 18.0801), // samma namn och plats
    g('740011111', 'Nedlagd', 0, [], 59, 18),
    { ...g('740098000', 'Stockholm', 90000, ['TRAIN', 'METRO', 'BUS'], 59.33, 18.06), area_type: 'META_STOP' },
    { ...g('740021706', 'Gullmarsplan T-bana', 1000, ['METRO'], 59.2992, 18.0806), area_type: 'RIKSHALLPLATS' },
    g('740022222', 'Storgatan', 90, ['BUS'], 63.83, 20.26, 'Umeå, Storgatan'),
    g('740033333', 'Storgatan', 80, ['BUS'], 65.58, 22.15, 'Luleå, Storgatan'),
  ], 10);
  assert.deepEqual(list.map((s) => s.slug), ['gullmarsplan', 'stockholm-centralstation', 'gullmarsplan-t-bana', 'storgatan', 'storgatan-lulea']);
  assert.deepEqual(list[0].modes, ['T-bana', 'Buss']);
  assert.equal(list[0].place, 'Stockholm');
  assert.deepEqual(list[0].near, ['740021706', '740000001']); // Umeå och Luleå är för långt bort
});

test('begränsningen följs', () => {
  const many = Array.from({ length: 20 }, (_, i) => g(String(740100000 + i), `Hållplats ${i}`, 100 + i, ['BUS'], 59 + i / 100, 18));
  assert.equal(buildStopList(many, 5).length, 5);
});
