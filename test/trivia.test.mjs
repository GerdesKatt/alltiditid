// "Visste du?": val av kuriosa bland Wikipedias artiklar nära en hållplats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { funFact, funScore, nameKey, pickTrivia, sharesStem, shortText, titleMatches, wikiQueryUrl } from '../lib/trivia.mjs';
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

test('ett torg i en stadsdel är inte stadsdelen', () => {
  const pages = [
    page('Gubbängstorget', 497, 'Gubbängstorget är ett torg i stadsdelen Gubbängen i Söderort inom Stockholms kommun.'),
    page('Gubbängen', 900, 'Gubbängen är en stadsdel i Söderort inom Stockholms kommun, med omkring 8 000 invånare.'),
  ];
  const t = pickTrivia(pages, 'Pepparvägen');
  assert.equal(t.kind, 'area');
  assert.equal(t.title, 'Gubbängen');
  assert.equal(pickTrivia(pages.slice(0, 1), 'Pepparvägen').kind, 'nearby');
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
    if (url.searchParams.get('titles')) {
      const extract = 'Gullmarsplan är en tunnelbanestation.\n\n== Historia ==\nStationen öppnade 1950 som en enkel ytstation. Ännu 1960 fanns här bara ett litet väntskjul.\n\n== Noter ==\nISBN 1';
      return new Response(JSON.stringify({ query: { pages: [{ title: url.searchParams.get('titles'), extract }] } }), { status: 200 });
    }
    const pages = url.hostname === 'sv.wikipedia.org' ? NEAR_GULLMARSPLAN : [];
    return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
  };
  try {
    const { status, body } = await board('action=trivia&name=Gullmarsplan&lat=59.29921&lon=18.08061&lang=en', {});
    assert.equal(status, 200);
    assert.equal(body.trivia.title, 'Gullmarsplans tunnelbanestation');
    assert.equal(body.trivia.lang, 'sv');
    assert.deepEqual(asked.map((u) => u.hostname), ['en.wikipedia.org', 'sv.wikipedia.org', 'sv.wikipedia.org']);
    // Den roligaste meningen ur hela artikeln, inte ingressen.
    assert.equal(body.trivia.text, "Ännu 1960 fanns här bara ett litet väntskjul.");
    assert.equal(body.trivia.intro, undefined);
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

const HERRANGEN = `Herrängen är en stadsdel i Söderort inom Stockholms kommun. Stadsdelen gränsar till Fruängen, Långbro och Långsjö.
Herrängen har fått sitt namn från Herrängens gård, som uppfördes under senare delen av 1700-talet.

== Historik ==
När brukspatron J.E. Lignell förvärvade egendomen Herrängen 1901 började utbyggnaden av stadsdelen. Ännu 1913 bodde här endast knappt 100 personer. Redan 1905 hade Stockholms stad fått ett erbjudande att förvärva Herrängens gårds marker men avböjde.

== Demografi ==
År 2017 hade stadsdelen cirka 3 800 invånare, varav cirka 11,9 procent med utländsk bakgrund.

== Noter ==
Stockholm utanför tullarna. ISBN 91-7031-132-3`;

test('det roliga längre ner vinner över den torra ingressen', () => {
  const text = funFact(HERRANGEN, 'Herrängen är en stadsdel i Söderort inom Stockholms kommun.');
  assert.equal(
    text,
    'Ännu 1913 bodde här endast knappt 100 personer. Redan 1905 hade Stockholms stad fått ett erbjudande att förvärva Herrängens gårds marker men avböjde.'
  );
  assert.ok(funScore('År 2017 hade stadsdelen cirka 3 800 invånare.') < 2);
  // Inget som sticker ut: ingressen.
  assert.equal(funFact('Torget är stenlagt.\n\nDet är fyrkantigt.', 'Torget är ett torg i staden, stenlagt och fyrkantigt.'), 'Torget är ett torg i staden, stenlagt och fyrkantigt.');
});

test('hållplatsen som heter efter platsen hittar platsen, och grannarna runt hörnet', () => {
  assert.equal(sharesStem('Herrängen', 'Herrängsplan'), true);
  assert.equal(sharesStem('Hägersten', 'Herrängsplan'), false);
  const pages = [
    page('Fruängen', 959, 'Fruängen är en stadsdel i södra Stockholm med tunnelbanestation sedan 1964.', { description: 'stadsdel i södra Stockholm' }),
    page('Långbro sjukhus', 782, 'Långbro sjukhus var ett psykiatriskt sjukhus i Långbro i södra Stockholm.', { description: 'f.d psykiatriskt sjukhus' }),
    page('Herrängen', 246, 'Herrängen är en stadsdel i Söderort inom Stockholms kommun med villor.', { description: 'stadsdel i Stockholm' }),
    page('Segeltorp (kommundel)', 757, 'Segeltorp är en kommundel i Huddinge kommun, söder om Stockholm.', { description: 'kommundel i Huddinge kommun' }),
    page('Delicato', 894, 'Delicato är ett svenskt företag som bakar bakverk, bland annat Delicatobollen.', { description: 'svenskt företag' }),
  ];
  const t = pickTrivia(pages, 'Herrängsplan');
  assert.equal(t.kind, 'namesake');
  assert.equal(t.title, 'Herrängen');
  // Stadsdelar och kommundelar hör inte hemma runt hörnet.
  assert.deepEqual(t.around.map((a) => [a.title, a.meters]), [['Långbro sjukhus', 782], ['Delicato', 894]]);
});

test('en mening som pekar bakåt får meningen före', () => {
  const full = 'Gullmarsplan är en station.\n\n== Historia ==\nStationen öppnade 1933 som spårvägshållplats. Den hette då Johanneshov och trafikerades av spårvagnar fram till den 1 oktober 1950, då den blev en del av tunnelbanan.';
  assert.match(funFact(full, ''), /^Stationen öppnade 1933 som spårvägshållplats\. Den hette då Johanneshov/);
});
