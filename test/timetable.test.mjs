// Landsbygden: tom realtid ger tidtabellen från ResRobot och hållplatsens läge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { board, localAt, minuteNow } from './helpers.mjs';

const now = minuteNow();
const t = (m) => localAt(now, m);

function mockFetch({ resrobot = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('realtime-api.trafiklab.se/v1/departures/')) {
      return new Response(
        JSON.stringify({ stops: [{ id: '740000451', name: 'Vilhelmina station', lat: 64.62, lon: 16.65 }], departures: [] })
      );
    }
    if (u.includes('api.resrobot.se/v2.1/departureBoard')) {
      if (!resrobot) return new Response(JSON.stringify({ Departure: [] }));
      const at = t(140);
      return new Response(
        JSON.stringify({
          Departure: [
            {
              Product: [{ name: 'Länstrafiken Buss 45', num: '45', catCode: '7', catOutL: 'Buss', operator: 'Länstrafiken i Västerbotten' }],
              time: `${at.slice(11, 16)}:00`,
              date: at.slice(0, 10),
              direction: 'Storuman busstation',
              lat: 64.62,
              lon: 16.65,
            },
          ],
        })
      );
    }
    return new Response('{}', { status: 404 });
  };
  return calls;
}

const env = { TRAFIKLAB_REALTIME_API_KEY: 'rt', TRAFIKLAB_RESROBOT_KEY: 'rr' };
const qs = 'action=departures&stopId=740000451&stopName=Vilhelmina%20station&mode=all&direction=departures';

test('tom realtid: tidtabellen från ResRobot med 6 timmars fönster', async () => {
  const calls = mockFetch();
  const { status, body } = await board(qs, env);
  assert.equal(status, 200);
  assert.equal(body.source, 'resrobot');
  assert.equal(body.departures.length, 1);
  assert.equal(body.departures[0].destination, 'Storuman busstation');
  assert.equal(body.departures[0].hasRealtime, false);
  assert.ok(calls.some((u) => u.includes('departureBoard') && u.includes('duration=360')));
  assert.deepEqual(body.stop, { lat: 64.62, lon: 16.65 });
});

test('tom överallt: tom tavla men med hållplatsens läge för taxi och cykel', async () => {
  mockFetch({ resrobot: false });
  const { status, body } = await board(qs, env);
  assert.equal(status, 200);
  assert.equal(body.departures.length, 0);
  assert.deepEqual(body.stop, { lat: 64.62, lon: 16.65 });
});

test('utan ResRobot-nyckel: ingen tidtabell, bara den tomma realtidstavlan', async () => {
  const calls = mockFetch();
  const { body } = await board(qs, { TRAFIKLAB_REALTIME_API_KEY: 'rt' });
  assert.equal(body.departures.length, 0);
  assert.ok(!calls.some((u) => u.includes('departureBoard')));
});
