import test from 'node:test';
import assert from 'node:assert/strict';
import { ferryDepartures, ferryHarbors, searchFerryHarbors } from '../lib/ferries.mjs';

const routes = [
  { Id: 1, Name: 'Hönöleden', Shortname: 'Hönö', Harbors: [{ Id: 11, Name: 'Lilla Varholmen' }, { Id: 12, Name: 'Hönö Pinan' }] },
  // Så här ser Trafikverkets riktiga svar ut: fältet heter Harbor.
  { Id: 2, Name: 'Gullmarsleden', Harbor: [{ Id: 21, Name: 'Finnsbo' }, { Id: 22, Name: 'Skår' }] },
  { Id: 3, Name: 'Nedlagd', Deleted: true, Harbors: [{ Id: 31, Name: 'Borta' }] },
  { Id: 4, Name: 'Björköleden', Harbors: [{ Id: 11, Name: 'Lilla Varholmen' }, { Id: 41, Name: 'Björkö' }] },
];

test('färjelägen: ett per hamn, borttagna leder räknas inte', () => {
  const harbors = ferryHarbors(routes);
  assert.deepEqual(harbors.map((h) => h.name), ['Björkö', 'Finnsbo', 'Hönö Pinan', 'Lilla Varholmen', 'Skår']);
  assert.equal(harbors.find((h) => h.name === 'Lilla Varholmen').route, 'Hönöleden');
});

test('sökning på hamn, del av namn, led och utan accenter', () => {
  const harbors = ferryHarbors(routes);
  const names = (q) => searchFerryHarbors(harbors, q).map((h) => h.name);
  assert.deepEqual(names('hono'), ['Hönö Pinan färjeläge', 'Lilla Varholmen färjeläge']);
  assert.deepEqual(names('Pinan'), ['Hönö Pinan färjeläge']);
  assert.deepEqual(names('gullmars'), ['Finnsbo färjeläge', 'Skår färjeläge']);
  assert.deepEqual(names('x'), []);
  assert.deepEqual(names('Stockholm'), []);
  const hit = searchFerryHarbors(harbors, 'Skår')[0];
  assert.deepEqual(hit, { id: 'fv:22', name: 'Skår färjeläge', place: 'Gullmarsleden', modes: ['Vägfärja'] });
});

test('avgångar: tid i svensk tid, mål, info och sortering', () => {
  const toLocal = (iso) => iso.slice(0, 16);
  const deps = ferryDepartures(
    [
      { Id: 2, DepartureTime: '2026-11-26T15:00:00.000+01:00', ToHarbor: { Name: 'Lilla Varholmen' }, Route: { Id: 1, Name: 'Hönöleden' } },
      { Id: 1, DepartureTime: '2026-11-26T14:40:00.000+01:00', ToHarbor: { Name: 'Lilla Varholmen' }, Route: { Id: 1, Name: 'Hönöleden' }, Info: ['Farligt gods', 'Farligt gods', ''] },
      { Id: 3, DepartureTime: '2026-11-26T14:50:00.000+01:00', Deleted: true },
      { Id: 4 },
    ],
    toLocal
  );
  assert.equal(deps.length, 2);
  assert.deepEqual(deps.map((d) => d.scheduledTime), ['14:40', '15:00']);
  assert.equal(deps[0].line, 'Hönöleden BÅT');
  assert.equal(deps[0].destination, 'Lilla Varholmen');
  assert.equal(deps[0].deviation, 'Farligt gods');
  assert.equal(deps[0].expectedAt, '2026-11-26T14:40');
  assert.equal(deps[0].hasRealtime, false);
  assert.equal(deps[0].transportMode, 'ferry');
});

// Hela vägen genom API:t: sökning som hittar färjeläget, och tavlan för det.
import { board, minuteNow } from './helpers.mjs';

test('API: sökning lägger till färjelägen, tavlan hämtas från Trafikverket', async () => {
  const bodies = [];
  const dep = new Date(minuteNow().getTime() + 12 * 60000).toISOString();
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/stops/name/')) {
      return new Response(JSON.stringify({ stop_groups: [
        { id: '740001', name: 'Hönö Pinan färjeläge', average_daily_stop_times: 80, transport_modes: ['BUS'], stops: [] },
      ] }));
    }
    if (u.includes('trafikinfo.trafikverket.se')) {
      const body = String(init?.body || '');
      bodies.push(body);
      if (body.includes('objecttype="FerryRoute"')) {
        return new Response(JSON.stringify({ RESPONSE: { RESULT: [{ FerryRoute: routes }] } }));
      }
      if (body.includes('objecttype="FerryAnnouncement"')) {
        return new Response(JSON.stringify({ RESPONSE: { RESULT: [{ FerryAnnouncement: [
          { Id: 7, DepartureTime: dep, FromHarbor: { Id: 12, Name: 'Hönö Pinan' }, ToHarbor: { Id: 11, Name: 'Lilla Varholmen' }, Route: { Id: 1, Name: 'Hönöleden' } },
        ] }] } }));
      }
    }
    return new Response('{}', { status: 404 });
  };
  const env = { TRAFIKLAB_REALTIME_API_KEY: 'rt', TRAFIKVERKET_API_KEY: 'tv' };

  const search = await board('action=search&q=H%C3%B6n%C3%B6', env);
  assert.equal(search.status, 200);
  assert.deepEqual(search.body.stops.map((s) => s.id), ['740001', 'fv:12', 'fv:11']);
  assert.deepEqual(search.body.stops[1].modes, ['Vägfärja']);

  const res = await board('stopId=fv%3A12&stopName=H%C3%B6n%C3%B6%20Pinan%20f%C3%A4rjel%C3%A4ge&direction=departures', env);
  assert.equal(res.status, 200);
  assert.equal(res.body.departures.length, 1);
  assert.equal(res.body.departures[0].destination, 'Lilla Varholmen');
  assert.equal(res.body.departures[0].line, 'Hönöleden BÅT');
  assert.match(bodies.at(-1), /<EQ name="FromHarbor.Id" value="12" \/>/);

  const arrivals = await board('stopId=fv%3A12&direction=arrivals', env);
  assert.deepEqual(arrivals.body.departures, []);
  const bad = await board('stopId=fv%3Aabc', env);
  assert.equal(bad.status, 400);
});
