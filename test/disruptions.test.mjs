// A4: störningar som står på flera rader samlas i en ruta per linje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { board, localAt, minuteNow } from './helpers.mjs';

const now = minuteNow();
const t = (m) => localAt(now, m);
const coords = { lat: 59.2989, lon: 18.0810 };
const green = (id, des, m, alerts = []) => ({
  scheduled: t(m), realtime: t(m), delay: 0, canceled: false, is_realtime: true,
  route: { name: 'Gröna linjen', designation: des, transport_mode: 'METRO', direction: 'Mål' },
  trip: { trip_id: id }, agency: { name: 'SL' }, stop: coords, alerts,
});
const generic = [{ title: 'Förseningar och inställda avgångar' }];

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('realtime-api.trafiklab.se/v1/departures/')) {
    return new Response(JSON.stringify({ stops: [{ id: '740021705', name: 'Gullmarsplan' }], departures: [
      green('A', '17', 3, generic),
      green('B', '18', 4, generic),
      green('C', '19', 5, generic),
      green('D', '19', 6, [{ title: 'Kort tåg' }]),
      { ...green('E', '160', 7), route: { name: 'Buss', designation: '160', transport_mode: 'BUS', direction: 'Årstaberg' } },
    ] }));
  }
  if (u.endsWith('/v1/sites')) return new Response(JSON.stringify([{ id: 9189, name: 'Gullmarsplan', lat: 59.2984, lon: 18.0809 }]));
  if (u.includes('/v1/sites/9189/departures')) {
    return new Response(JSON.stringify({
      departures: [],
      stop_deviations: [
        { message: 'Skärmarbrink: hissen är avstängd.', importance_level: 2, scope: { lines: [{ designation: '17' }, { designation: '18' }, { designation: '19' }] } },
        { message: 'Gäller en linje som inte går här.', importance_level: 1, scope: { lines: [{ designation: '999' }] } },
      ],
    }));
  }
  return new Response('{}', { status: 404 });
};

test('samma text på flera rader blir en störning med linjerna', async () => {
  const { body } = await board('action=departures&stopId=740021705&stopName=Gullmarsplan&mode=all&direction=departures', { TRAFIKLAB_REALTIME_API_KEY: 'rt' });
  const texts = (body.disruptions || []).map((d) => d.text);
  assert.equal(texts[0], 'Förseningar och inställda avgångar'); // det som syns på raderna först
  const generic = body.disruptions.find((d) => d.text === 'Förseningar och inställda avgångar');
  assert.deepEqual(generic.lines, ['Gröna linjen 17', 'Gröna linjen 18', 'Gröna linjen 19']);
  // Hållplatsens egen störning från SL, bara för linjer som går här.
  assert.ok(texts.includes('Skärmarbrink: hissen är avstängd.'));
  assert.ok(!texts.includes('Gäller en linje som inte går här.'));
  // Avsändaren står med, så att SL:s "vår trygghetscentral" inte läses som appens.
  assert.equal(generic.from, 'SL');
  assert.equal(body.disruptions.find((d) => d.text === 'Skärmarbrink: hissen är avstängd.').from, 'SL');
  assert.ok(body.departures.every((d) => !('_from' in d)));
  // Raderna har inte kvar den gemensamma texten, men det som bara gäller en tur står kvar.
  const rows = body.departures.map((d) => d.deviation).filter(Boolean);
  assert.deepEqual(rows, ['Kort tåg']);
});
