// Sök: ort och trafikslag i förslagen (punkt 6 i brand guidens lista).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { board } from './helpers.mjs';

test('sökförslag får ort och trafikslag', async () => {
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('/stops/name/karl'));
    return new Response(JSON.stringify({ stop_groups: [
      { id: '740000003', name: 'Karlstad Centralstation', average_daily_stop_times: 900, transport_modes: ['BUS', 'TRAIN'],
        stops: [{ id: '1', name: 'Karlstad, Centralstation', lat: 59.37, lon: 13.5 }] },
      { id: '740021600', name: 'Karlaplan', average_daily_stop_times: 1200, transport_modes: ['METRO', 'BUS'],
        stops: [{ id: '2', name: 'Karlaplan', lat: 59.33, lon: 18.09 }] },
      { id: '740000999', name: 'Karlsro', average_daily_stop_times: 0, transport_modes: [], stops: [] },
    ] }));
  };
  const { body } = await board('action=search&q=karl', { TRAFIKLAB_REALTIME_API_KEY: 'rt' });
  assert.deepEqual(body.stops, [
    { id: '740021600', name: 'Karlaplan', modes: ['T-bana', 'Buss'] },
    { id: '740000003', name: 'Karlstad Centralstation', place: 'Karlstad', modes: ['Tåg', 'Buss'] },
  ]);
});
