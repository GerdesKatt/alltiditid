// Hållplatser som hör ihop (Stockholm C, Stockholm City, T-Centralen) visas som en station.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupFor, groupedStop, mergeStops, sameStation, STATION_GROUPS } from '../lib/stationGroups.mjs';
import { buildStopList } from '../lib/stopList.mjs';

test('varje grupp ryms på en tavla och ingen hållplats finns i två grupper', () => {
  const seen = new Set();
  for (const g of STATION_GROUPS) {
    assert.ok(g.ids.length >= 2 && g.ids.length <= 4, g.name);
    for (const id of g.ids) {
      assert.ok(!seen.has(id), id);
      seen.add(id);
    }
  }
});

test('T-Centralen och Stockholm C är samma station, Slussen är en annan', () => {
  assert.ok(sameStation('740020749', '740000001'));
  assert.ok(sameStation('740001617', '740000001,740001617,740020749,740000622'));
  assert.ok(!sameStation('740020749', '740020101'));
  assert.ok(sameStation('740098559', '740098559'));
  assert.ok(!sameStation('740098559', '740021705'));
  assert.equal(groupFor('740021705'), undefined);
});

test('en hållplats i en grupp blir hela stationen', () => {
  const s = groupedStop({ id: '740020749', name: 'T-Centralen T-bana' });
  assert.equal(s.id, '740000001,740001617,740020749,740000622');
  assert.equal(s.name, 'Stockholm C / T-Centralen');
  assert.deepEqual(groupedStop({ id: '740021705', name: 'Gullmarsplan' }), { id: '740021705', name: 'Gullmarsplan' });
});

test('sökförslag från samma station slås ihop på den förstas plats', () => {
  const merged = mergeStops([
    { id: '740000001', name: 'Stockholm Centralstation', modes: ['Tåg'] },
    { id: '740001617', name: 'Stockholm City station', modes: ['Tåg'] },
    { id: '740000622', name: 'Stockholm Cityterminalen', modes: ['Buss'] },
    { id: '740004383', name: 'Stockholm C Klarabergsviadukte', modes: ['Buss'] },
    { id: '740020749', name: 'T-Centralen T-bana', modes: ['T-bana'] },
  ]);
  assert.deepEqual(
    merged.map((s) => s.name),
    ['Stockholm C / T-Centralen', 'Stockholm C Klarabergsviadukte']
  );
  assert.deepEqual(merged[0].modes, ['Tåg', 'Buss', 'T-bana']);
});

const g = (id, name, daily, lat, lon) => ({
  id, name, average_daily_stop_times: daily, transport_modes: ['BUS'],
  stops: [{ id: id + 'x', name, lat, lon }],
});

test('grannarna hoppar över den egna stationen och visar en annan station en gång', () => {
  const list = buildStopList([
    g('740000001', 'Stockholm Centralstation', 600, 59.3315, 18.0549),
    g('740020749', 'T-Centralen T-bana', 2000, 59.3317, 18.0617),
    g('740020101', 'Slussen T-bana', 2400, 59.3196, 18.0726),
    g('740077425', 'Slussen bussterminal', 760, 59.3186, 18.0809),
    g('740021013', 'Odenplan T-bana', 2200, 59.3428, 18.0486),
  ]);
  const near = (id) => list.find((s) => s.id === id).near;
  assert.deepEqual(near('740000001'), ['740021013', '740020101']);
  assert.deepEqual(near('740020749'), ['740021013', '740020101']);
  assert.ok(!near('740021013').includes('740077425'));
});
