// Bygger public/adresser/*.json av Lantmäteriets belägenhetsadresser (öppna data).
//
//   node scripts/build-addresses.mjs <fil> [--map gata=FÄLT,nummer=FÄLT,bokstav=FÄLT,ort=FÄLT]
//
// <fil> kan vara:
//   .gpkg      GeoPackage direkt från Geotorget (läses med Node:s inbyggda sqlite, Node 22.5+)
//   .geojsonl  en GeoJSON-feature per rad, t.ex. från `ogr2ogr -f GeoJSONSeq ut.geojsonl in.gml`
//   .geojson   en FeatureCollection
// Koordinater i SWEREF 99 TM (Lantmäteriets standard) räknas om till WGS84; WGS84 går också.
// Fälten letas upp av sig själva (gatunamn, adressplatsnummer, bokstavstillägg, postort …);
// skriv --map om de heter något annat. Skriptet skriver ut vilka fält det valde.
//
// Ingen nätverkstrafik och inga tjänster: allt sker på datorn, och filerna läggs bland
// sajtens egna filer (Cloudflare Pages, gratis).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { buildShards, houseNumber, sweref99tmToWgs84 } from '../lib/addressBook.mjs';

const OUT = path.join(process.cwd(), 'public', 'adresser');

// Troliga fältnamn i Lantmäteriets leveranser, i den ordning de provas.
const GUESS = {
  gata: ['adressomradesnamn', 'adressomrade', 'gatunamn', 'gata', 'adressomrade_namn', 'kommundelsnamn_gata', 'street', 'addr:street'],
  nummer: ['adressplatsnummer', 'adressnummer', 'nummer', 'husnummer', 'housenumber', 'addr:housenumber'],
  bokstav: ['bokstavstillagg', 'bokstavstillägg', 'bokstav', 'littera'],
  ort: ['postort', 'postortsnamn', 'ort', 'city', 'addr:city'],
  helAdress: ['adress', 'belagenhetsadress', 'adressbeteckning', 'beteckning'],
};

function parseArgs(argv) {
  const file = argv.find((a) => !a.startsWith('--'));
  const mapArg = argv.find((a) => a.startsWith('--map'));
  const map = {};
  const raw = mapArg ? (mapArg.includes('=') && mapArg.startsWith('--map=') ? mapArg.slice(6) : argv[argv.indexOf(mapArg) + 1] || '') : '';
  for (const pair of raw.split(',').filter(Boolean)) {
    const [k, v] = pair.split('=');
    if (k && v) map[k.trim()] = v.trim();
  }
  return { file, map };
}

/** Väljer fält en gång, utifrån första radens egenskaper. */
function pickFields(props, map) {
  const keys = Object.keys(props);
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  const find = (role) => map[role] || (GUESS[role] || []).map((g) => lower.get(g)).find(Boolean) || '';
  return { gata: find('gata'), nummer: find('nummer'), bokstav: find('bokstav'), ort: find('ort'), helAdress: find('helAdress') };
}

function toWgs(x, y) {
  // SWEREF 99 TM: östlig koordinat runt 200 000–1 000 000, nordlig runt 6 100 000–7 700 000.
  if (Math.abs(x) > 180 || Math.abs(y) > 90) {
    const [e, n] = x > y ? [y, x] : [x, y];
    return sweref99tmToWgs84(n, e);
  }
  return { lat: y, lon: x };
}

function record(props, coords, f) {
  let street = f.gata ? props[f.gata] : '';
  let number = [f.nummer ? props[f.nummer] : '', f.bokstav ? props[f.bokstav] : ''].join('');
  if ((!street || !houseNumber(number)) && f.helAdress && props[f.helAdress]) {
    const m = /^(.*\D)\s+(\d{1,4}\s?[a-zA-ZåäöÅÄÖ]?)\b/.exec(String(props[f.helAdress]));
    if (m) {
      street = street || m[1];
      number = m[2];
    }
  }
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const { lat, lon } = toWgs(Number(coords[0]), Number(coords[1]));
  return { street: String(street || '').trim(), number, town: f.ort ? String(props[f.ort] || '') : '', lat, lon };
}

async function* readGeoJsonLines(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim().replace(/^\x1e/, '').replace(/,$/, '');
    if (!t.startsWith('{')) continue;
    const feat = JSON.parse(t);
    if (feat.type === 'Feature') yield { props: feat.properties || {}, coords: firstPoint(feat.geometry) };
  }
}

function* readGeoJson(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const feat of data.features || []) yield { props: feat.properties || {}, coords: firstPoint(feat.geometry) };
}

function firstPoint(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'MultiPoint') return g.coordinates[0];
  return null;
}

/** GeoPackage: geometrin är en GPKG-blob (huvud + WKB). Punkter räcker. */
function gpkgPoint(blob) {
  const b = Buffer.from(blob);
  if (b[0] !== 0x47 || b[1] !== 0x50) return null;
  const flags = b[3];
  const env = (flags >> 1) & 0x07;
  const envBytes = [0, 32, 48, 48, 64][env] || 0;
  let o = 8 + envBytes;
  const le = b[o] === 1;
  const type = le ? b.readUInt32LE(o + 1) : b.readUInt32BE(o + 1);
  o += 5;
  if (type % 1000 === 4) {
    // MultiPoint: hoppa till första punkten
    o += 4;
    const le2 = b[o] === 1;
    o += 5;
    return [le2 ? b.readDoubleLE(o) : b.readDoubleBE(o), le2 ? b.readDoubleLE(o + 8) : b.readDoubleBE(o + 8)];
  }
  if (type % 1000 !== 1) return null;
  return [le ? b.readDoubleLE(o) : b.readDoubleBE(o), le ? b.readDoubleLE(o + 8) : b.readDoubleBE(o + 8)];
}

async function* readGpkg(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  const tables = db.prepare("SELECT table_name, column_name FROM gpkg_geometry_columns").all();
  if (!tables.length) throw new Error('Hittade ingen tabell med geometri i GeoPackage-filen.');
  for (const { table_name: table, column_name: geom } of tables) {
    console.log(`Läser tabellen ${table}`);
    for (const row of db.prepare(`SELECT * FROM "${table}"`).iterate()) {
      const { [geom]: blob, ...props } = row;
      yield { props, coords: blob ? gpkgPoint(blob) : null };
    }
  }
}

async function main() {
  const { file, map } = parseArgs(process.argv.slice(2));
  if (!file || !fs.existsSync(file)) {
    console.error('Ange filen: node scripts/build-addresses.mjs <adresser.gpkg|.geojsonl|.geojson>');
    process.exit(1);
  }
  const ext = path.extname(file).toLowerCase();
  const rows = ext === '.gpkg' ? readGpkg(file) : ext === '.geojson' || ext === '.json' ? readGeoJson(file) : readGeoJsonLines(file);
  let fields = null;
  const records = [];
  let skipped = 0;
  for await (const { props, coords } of rows) {
    if (!fields) {
      fields = pickFields(props, map);
      console.log('Fält:', JSON.stringify(fields), '\nAlla fält i första raden:', Object.keys(props).join(', '));
      if (!(fields.gata || fields.helAdress) || !(fields.nummer || fields.helAdress)) {
        console.error('Hittade inte gata och nummer. Kör igen med --map gata=FÄLT,nummer=FÄLT,bokstav=FÄLT,ort=FÄLT');
        process.exit(1);
      }
    }
    const r = record(props, coords, fields);
    if (r && r.street && houseNumber(r.number) && r.lat > 55 && r.lat < 69.2 && r.lon > 10.5 && r.lon < 24.3) records.push(r);
    else skipped += 1;
  }
  const shards = buildShards(records);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  let bytes = 0;
  for (const [key, shard] of shards) {
    const text = JSON.stringify(shard);
    bytes += text.length;
    fs.writeFileSync(path.join(OUT, `${key}.json`), text);
  }
  fs.writeFileSync(
    path.join(OUT, 'index.json'),
    JSON.stringify({ addresses: records.length, files: shards.size, source: 'Lantmäteriet, belägenhetsadresser (öppna data)', built: new Date().toISOString().slice(0, 10) })
  );
  console.log(`${records.length} adresser i ${shards.size} filer (${(bytes / 1e6).toFixed(1)} MB), ${skipped} hoppades över.`);
  if (shards.size > 19000) console.warn('Varning: Cloudflare Pages tillåter högst 20 000 filer per publicering.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
