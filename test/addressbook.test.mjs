// Lantmäteriets adresser: filerna under public/adresser/ och hur servern använder dem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildShards, findInShard, houseNumber, shardKey, sweref99tmToWgs84 } from '../lib/addressBook.mjs';
import { onRequest } from '../functions/api/trafik.js';

const HOME = { lat: 59.27731, lon: 17.97951 };
const records = [
  { street: 'Blåklintsvägen', number: '4A', town: 'Älvsjö', ...HOME },
  { street: 'Blåklintsvägen', number: '4', town: 'Älvsjö', lat: 59.27745, lon: 17.97925 },
  { street: 'Blåklintsvägen', number: '4a', town: 'Skogås', lat: 59.2293, lon: 18.1457 },
  { street: 'Blåklintsvägen', number: '4', town: 'Hällekis', lat: 58.6236, lon: 13.4239 },
  { street: 'Blåsutvägen', number: '1', town: 'Bandhagen', lat: 59.27, lon: 18.05 },
];

test('houseNumber och shardKey', () => {
  assert.equal(houseNumber('4 a'), '4A');
  assert.equal(houseNumber('04'), '4');
  assert.equal(houseNumber('väg'), '');
  assert.equal(shardKey('Blåklintsvägen'), 'bla');
  assert.equal(shardKey('S:t Eriksgatan'), 'ste');
});

test('buildShards och findInShard: 4A och 4 är olika hus, orten följer med', () => {
  const shards = buildShards(records);
  const bla = shards.get('bla');
  assert.ok(bla);
  const a = findInShard(bla, 'Blåklintsvägen', '4A');
  assert.deepEqual(a.map((p) => p.detail).sort(), ['Skogås', 'Älvsjö']);
  assert.equal(a.find((p) => p.detail === 'Älvsjö').name, 'Blåklintsvägen 4A');
  assert.equal(a.find((p) => p.detail === 'Älvsjö').lat, HOME.lat);
  assert.deepEqual(findInShard(bla, 'blaklintsvagen', '4').map((p) => p.detail).sort(), ['Hällekis', 'Älvsjö']);
  assert.equal(findInShard(bla, 'Blåklintsvägen', '4B').length, 0);
  assert.equal(findInShard(bla, 'Blåklintsvägn', '4A').length, 2, 'en bokstav fel i gatan');
});

test('SWEREF 99 TM till WGS84', () => {
  const p = sweref99tmToWgs84(6580822, 674032);
  assert.ok(Math.abs(p.lat - 59.330) < 0.002 && Math.abs(p.lon - 18.059) < 0.002);
});

/** Sajtens filer som ASSETS, med de byggda adressfilerna. */
function assets(shards) {
  return {
    fetch: async (req) => {
      const m = /\/adresser\/([a-z0-9]+)\.json$/.exec(new URL(req.url).pathname);
      const shard = m && shards.get(m[1]);
      return shard ? new Response(JSON.stringify(shard)) : new Response('Not found', { status: 404 });
    },
  };
}

const trip = {
  duration: 'PT25M',
  LegList: { Leg: [{ type: 'JNY', Origin: { name: 'A', time: '08:00:00' }, Destination: { name: 'B', time: '08:25:00' }, Product: [{ catCode: 3, catOutL: 'Buss', displayNumber: '144' }], duration: 'PT25M' }] },
};

async function plan(body, urls) {
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    urls.push(u);
    if (u.includes('/trip?')) return new Response(JSON.stringify({ Trip: [trip] }));
    if (u.includes('photon')) return new Response(JSON.stringify({ features: [] }));
    if (u.includes('/location.name?')) return new Response(JSON.stringify({ stopLocationOrCoordLocation: [] }));
    return new Response('{}', { status: 404 });
  };
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=plan', { method: 'POST', body: JSON.stringify(body) }),
    env: { TRAFIKLAB_RESROBOT_KEY: 'rr', ASSETS: assets(buildShards(records)) },
    waitUntil() {},
  });
  return { status: res.status, body: await res.json() };
}

test('action=plan: "Blåklintsvägen 4A Älvsjö" blir huset i Älvsjö, säkert, utan kart- eller ResRobot-sökning', async () => {
  const urls = [];
  const { status, body } = await plan({ to: 'Blåklintsvägen 4A Älvsjö', fromId: '740021705' }, urls);
  assert.equal(status, 200);
  assert.equal(body.to, 'Blåklintsvägen 4A');
  assert.equal(body.toDetail, 'Älvsjö');
  assert.equal(body.sure, true);
  assert.ok(urls.find((u) => u.includes('/trip?')).includes(`destCoordLat=${HOME.lat}`));
  assert.ok(!urls.some((u) => u.includes('location.name') || u.includes('photon')), 'inga andra sökningar behövs');
});

test('action=plan: "Blåklintsvägen 4A" utan ort blir den närmast positionen', async () => {
  const near = await plan({ to: 'Blåklintsvägen 4A', lat: 59.2856, lon: 17.9649 }, []);
  assert.equal(near.body.toDetail, 'Älvsjö');
  const far = await plan({ to: 'Blåklintsvägen 4A', lat: 59.23, lon: 18.16 }, []);
  assert.equal(far.body.toDetail, 'Skogås');
});

test('action=plan: sitter man på adressen säger appen det', async () => {
  const { status, body } = await plan({ to: 'Blåklintsvägen 4A Älvsjö', lat: HOME.lat, lon: HOME.lon }, []);
  assert.equal(status, 409);
  assert.match(body.error, /Du är redan vid Blåklintsvägen 4A/);
});

test('action=places: förslaget är huset i Älvsjö', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ features: [] }));
  const res = await onRequest({
    request: new Request('https://alltiditid.se/api/trafik?action=places&q=Bl%C3%A5klintsv%C3%A4gen%204A%20%C3%84lvsj%C3%B6'),
    env: { ASSETS: assets(buildShards(records)) },
    waitUntil() {},
  });
  const body = await res.json();
  assert.equal(body.places[0].name, 'Blåklintsvägen 4A');
  assert.equal(body.places[0].detail, 'Älvsjö');
  assert.equal(body.places[0].source, undefined);
});

test('scripts/build-addresses.mjs: GeoJSONSeq i SWEREF 99 TM och GeoPackage', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adresser-'));
  const script = path.resolve('scripts/build-addresses.mjs');
  const line = (props, x, y) => JSON.stringify({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [x, y] } });
  fs.writeFileSync(
    path.join(dir, 'in.geojsonl'),
    [
      line({ adressomradesnamn: 'Blåklintsvägen', adressplatsnummer: '4', bokstavstillagg: 'A', postort: 'Älvsjö' }, 668000, 6575000),
      line({ adressomradesnamn: 'Blåklintsvägen', adressplatsnummer: '4', bokstavstillagg: '', postort: 'Älvsjö' }, 668010, 6575010),
    ].join('\n')
  );
  execFileSync(process.execPath, [script, path.join(dir, 'in.geojsonl')], { cwd: dir, stdio: 'pipe' });
  const shard = JSON.parse(fs.readFileSync(path.join(dir, 'public/adresser/bla.json'), 'utf8'));
  const hits = findInShard(shard, 'Blåklintsvägen', '4A');
  assert.equal(hits.length, 1);
  assert.ok(hits[0].lat > 59.2 && hits[0].lat < 59.4 && hits[0].lon > 17.8 && hits[0].lon < 18.2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'public/adresser/index.json'), 'utf8')).addresses, 2);

  // GeoPackage med en punkt (GPKG-huvud + WKB).
  const { DatabaseSync } = await import('node:sqlite');
  const gpkg = path.join(dir, 'in.gpkg');
  const db = new DatabaseSync(gpkg);
  db.exec('CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT); INSERT INTO gpkg_geometry_columns VALUES (\'adress\', \'geom\');');
  db.exec('CREATE TABLE adress (geom BLOB, gatunamn TEXT, adressplatsnummer TEXT, bokstavstillagg TEXT, postort TEXT)');
  const blob = Buffer.alloc(8 + 21);
  blob.write('GP', 0, 'latin1');
  blob[2] = 0;
  blob[3] = 0x01; // little endian, inget envelope
  blob.writeInt32LE(3006, 4);
  blob[8] = 1;
  blob.writeUInt32LE(1, 9);
  blob.writeDoubleLE(668000, 13);
  blob.writeDoubleLE(6575000, 21);
  db.prepare('INSERT INTO adress VALUES (?, ?, ?, ?, ?)').run(blob, 'Blåklintsvägen', '4', 'A', 'Älvsjö');
  db.close();
  execFileSync(process.execPath, [script, gpkg], { cwd: dir, stdio: 'pipe' });
  const fromGpkg = JSON.parse(fs.readFileSync(path.join(dir, 'public/adresser/bla.json'), 'utf8'));
  assert.equal(findInShard(fromGpkg, 'Blåklintsvägen', '4A')[0].detail, 'Älvsjö');
  fs.rmSync(dir, { recursive: true, force: true });
});
