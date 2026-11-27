// "Visste du?": val av kuriosa bland Wikipedias artiklar nära en hållplats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, pickTrivia, shortText, titleMatches, wikiQueryUrl } from '../lib/trivia.mjs';
import { board } from './helpers.mjs';

const page = (title, dist, extract, extra = {}) => ({
  title,
  extract,
  coordinates: [{ lat: 59.3, lon: 18.08, dist }],
  ...extra,
});

const NEAR_GULLMARSPLAN = [
  page('Globen', 520, 'Globen är en sfärisk arenabyggnad i Johanneshov i södra Stockholm, invigd 1989.'),
  page('Johanneshov', 300, 'Johanneshov är en stadsdel i Söderort inom Stockholms kommun, med omkring 7 000 invånare.'),
  page(
    'Gullmarsplans tunnelbanestation',
    40,
    'Gullmarsplan är en tunnelbanestation på gröna linjen i Stockholms tunnelbana. Stationen öppnade 1950 och var då en ytstation. Den byggdes om till en knutpunkt med bussterminal 1964.'
  ),
];

test('stationens egen artikel går först', () => {
  const t = pickTrivia(NEAR_GULLMARSPLAN, 'Gullmarsplan');
  assert.equal(t.kind, 'station');
  assert.equal(t.title, 'Gullmarsplans tunnelbanestation');
  assert.match(t.text, /öppnade 1950/);
  assert.equal(t.url, 'https://sv.wikipedia.org/wiki/Gullmarsplans_tunnelbanestation');
  assert.equal(t.meters, 40);
});

test('liten busshållplats utan egen artikel får stadsdelen', () => {
  const t = pickTrivia(NEAR_GULLMARSPLAN.slice(0, 2), 'Sandfjärdsgatan');
  assert.equal(t.kind, 'area');
  assert.equal(t.title, 'Johanneshov');
});

test('annars något alldeles i närheten, men inte långt bort', () => {
  const church = page('Skogskyrkogården', 250, 'Skogskyrkogården är en begravningsplats i Gamla Enskede, ritad av Asplund och Lewerentz.');
  assert.equal(pickTrivia([church], 'Kyrkogårdsvägen').kind, 'nearby');
  assert.equal(pickTrivia([{ ...church, coordinates: [{ dist: 1500 }] }], 'Kyrkogårdsvägen'), null);
});

test('förgreningssidor, listor och tomma texter hoppas över', () => {
  const pages = [
    page('Johanneshov', 300, 'Johanneshov kan syfta på flera saker i Sverige, se nedan för en lista.', { pageprops: { disambiguation: '' } }),
    page('Lista över Stockholms tunnelbanestationer', 10, 'Det här är en lista över alla stationer i Stockholms tunnelbana, ordnade efter linje.'),
    page('Kort', 5, 'För kort.'),
  ];
  assert.equal(pickTrivia(pages, 'Johanneshov'), null);
});

test('namn utan läge godtas bara när titeln matchar', () => {
  const lund = { title: 'Lunds centralstation', extract: 'Lunds centralstation är en järnvägsstation i Lund, öppnad 1856 med Södra stambanan.' };
  const other = { title: 'Lunds universitet', extract: 'Lunds universitet är ett av Nordens största universitet, grundat 1666 i Lund.' };
  assert.equal(pickTrivia([other, lund], 'Lund C').title, 'Lunds centralstation');
  assert.equal(pickTrivia([other], 'Malmö C'), null);
});

test('hållplatsnamn och titlar jämförs utan brus', () => {
  assert.equal(nameKey('Lund C'), 'lund');
  assert.equal(nameKey('Slussen (Stockholm)'), 'slussen');
  assert.equal(titleMatches('Slussen', 'Slussen'), true);
  assert.equal(titleMatches('Slussens tunnelbanestation', 'Slussen'), true);
  assert.equal(titleMatches('Slussenområdet', 'Slussen'), false);
  assert.equal(titleMatches('Ö', 'Ö'), false);
});

test('texten är kort och klipps vid meningar, inte i förkortningar', () => {
  const s = shortText('Gullmarsplan (uttal ˈgɵlmarsˌplɑːn) är en plats i Stockholm, t.ex. känd för bussarna. Den byggdes 1950. ' + 'Mer text. '.repeat(40));
  assert.match(s, /^Gullmarsplan är en plats i Stockholm, t\.ex\. känd för bussarna\. Den byggdes 1950\./);
  assert.ok(s.length <= 320);
  assert.ok(shortText('a '.repeat(400)).endsWith('…'));
});

test('frågan till Wikipedia: geosearch med läge, sökning utan', () => {
  const geo = new URL(wikiQueryUrl({ name: 'Gullmarsplan', lat: 59.299, lon: 18.081 }));
  assert.equal(geo.hostname, 'sv.wikipedia.org');
  assert.equal(geo.searchParams.get('generator'), 'geosearch');
  assert.equal(geo.searchParams.get('ggscoord'), '59.299|18.081');
  const byName = new URL(wikiQueryUrl({ name: 'Gullmarsplan', lang: 'en' }));
  assert.equal(byName.hostname, 'en.wikipedia.org');
  assert.equal(byName.searchParams.get('gsrsearch'), 'Gullmarsplan');
});

test('action=trivia: utan Trafiklab-nyckel, engelska faller tillbaka på svenska', async () => {
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    asked.push(url);
    assert.match(init.headers['User-Agent'], /alltiditid\.se/);
    const pages = url.hostname === 'sv.wikipedia.org' ? NEAR_GULLMARSPLAN : [];
    return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
  };
  try {
    const { status, body } = await board('action=trivia&name=Gullmarsplan&lat=59.29921&lon=18.08061&lang=en', {});
    assert.equal(status, 200);
    assert.equal(body.trivia.title, 'Gullmarsplans tunnelbanestation');
    assert.equal(body.trivia.lang, 'sv');
    assert.deepEqual(asked.map((u) => u.hostname), ['en.wikipedia.org', 'sv.wikipedia.org']);
    // Läget avrundas (cirka 100 m) innan det skickas vidare.
    assert.equal(asked[0].searchParams.get('ggscoord'), '59.299|18.081');

    globalThis.fetch = async () => new Response('fel', { status: 503 });
    const down = await board('action=trivia&name=Gullmarsplan&lat=59.299&lon=18.081', {});
    assert.deepEqual(down.body, { trivia: null });

    const bad = await board('action=trivia&name=', {});
    assert.equal(bad.status, 400);
  } finally {
    globalThis.fetch = real;
  }
});
