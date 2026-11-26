// Tåg från Trafikverket: stående tåg, tåg som saknas och ett tågs hela resa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingTrains, trainJourney, tvLocal } from '../lib/trains.mjs';

const iso = (min) => new Date(Date.now() + min * 60000).toISOString();
const nowLocal = tvLocal(new Date().toISOString());
const names = { Av: 'Alvesta', M: 'Malmö C', Cst: 'Stockholm C', Lp: 'Linköping C', N: 'Nässjö C' };
const nameOf = (s) => names[s] || '';
const ann = (ident, min, extra = {}) => ({
  AdvertisedTrainIdent: ident,
  AdvertisedTimeAtLocation: iso(min),
  ProductInformation: [{ Code: 'PNA014', Description: 'SJ Snabbtåg' }],
  InformationOwner: 'SJ',
  ToLocation: [{ LocationName: 'Cst', Priority: 1, Order: 0 }],
  FromLocation: [{ LocationName: 'M', Priority: 1, Order: 0 }],
  Advertised: true,
  ...extra,
});

test('stående tåg kommer med och märks, gångna och kända tas bort', () => {
  const list = missingTrains({
    announcements: [
      ann('532', -10), // borde ha gått, har inte gått
      ann('534', -10, { TimeAtLocation: iso(-9) }), // har gått
      ann('536', 120, { TrackAtLocation: '2' }), // två timmar fram
      ann('501', 20), // finns redan hos Trafiklab
      ann('2119', 5, { ProductInformation: [{ Description: 'Pendeltåg' }] }),
    ],
    known: ['501'],
    direction: 'departures',
    nowLocal,
    nameOf,
    tvStation: 'Alvesta station',
  });
  assert.deepEqual(list.map((d) => d.trainNumber), ['532', '536']);
  assert.equal(list[0].pending, true);
  assert.match(list[0].deviation, /Ny tid saknas/);
  assert.equal(list[0].line, 'SJ Snabbtåg 532');
  assert.equal(list[0].destination, 'Stockholm C');
  assert.equal(list[1].track, '2');
  assert.equal(list[1].pending, undefined);
});

test('tågets resa: stationer i ordning och var tåget är nu', () => {
  const j = trainJourney(
    [
      ann('532', -120, { ActivityType: 'Avgang', LocationSignature: 'M', TimeAtLocation: iso(-118) }),
      ann('532', -12, { ActivityType: 'Ankomst', LocationSignature: 'Av', TimeAtLocation: iso(-4) }),
      ann('532', -10, { ActivityType: 'Avgang', LocationSignature: 'Av', EstimatedTimeAtLocation: iso(6), TrackAtLocation: '3' }),
      ann('532', 60, { ActivityType: 'Ankomst', LocationSignature: 'N' }),
      ann('532', 200, { ActivityType: 'Ankomst', LocationSignature: 'Cst' }),
    ],
    nameOf,
    nowLocal
  );
  assert.deepEqual(j.stops.map((s) => s.name), ['Malmö C', 'Alvesta', 'Nässjö C', 'Stockholm C']);
  assert.equal(j.product, 'SJ Snabbtåg');
  assert.equal(j.from, 'Malmö C');
  assert.equal(j.to, 'Stockholm C');
  assert.equal(j.position, 'Står i Alvesta · 8 min sen');
  assert.equal(j.stops[1].track, '3');
  assert.equal(j.stops[1].departure.delay, 16);
  assert.deepEqual(j.stops.map((s) => s.passed), [true, true, false, false]);
});
