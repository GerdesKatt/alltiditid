import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightStatus, langFromBrowser, lineLabel, modeLabel, modesSentence, trainPosition } from '../lib/lang.ts';

test('språket följer webbläsaren: det första kända språket vinner', () => {
  assert.equal(langFromBrowser(['sv-SE', 'en-US']), 'sv');
  assert.equal(langFromBrowser(['en-GB', 'sv']), 'en');
  assert.equal(langFromBrowser(['de-DE', 'sv-SE']), 'sv');
  assert.equal(langFromBrowser(['de-DE', 'fr']), 'en');
  assert.equal(langFromBrowser([]), 'sv');
});

test('linjer och trafikslag på engelska', () => {
  assert.equal(lineLabel('Buss 160', 'en'), 'Bus 160');
  assert.equal(lineLabel('Pendeltåg 41', 'en'), 'Commuter train 41');
  assert.equal(lineLabel('Gröna linjen 19', 'en'), 'Green line 19');
  assert.equal(lineLabel('SJ Snabbtåg 537', 'en'), 'SJ Snabbtåg 537');
  assert.equal(lineLabel('Buss 160', 'sv'), 'Buss 160');
  assert.equal(modesSentence(['T-bana', 'Spårvagn', 'Buss'], 'en'), 'metro, tram and bus');
  assert.equal(modeLabel('Anropsstyrd', 'en'), 'On-demand');
  assert.equal(lineLabel('Linje 5', 'en'), 'Line 5');
  // Alla trafikslag som API:et skickar har en engelsk text.
  for (const m of ['Tåg', 'T-bana', 'Spårvagn', 'Buss', 'Båt', 'Pendeltåg', 'Anropsstyrd', 'Linje']) {
    assert.notEqual(modeLabel(m, 'en'), m, m);
  }
});

test('tågets position och flygstatus översätts', () => {
  assert.equal(trainPosition('Har lämnat Norrköping C · 4 min sen', 'en'), 'Has left Norrköping C · 4 min late');
  assert.equal(trainPosition('Har inte avgått från Malmö C än', 'en'), 'Has not left Malmö C yet');
  assert.equal(flightStatus('Beräknad 11:40', 'en'), 'Estimated 11:40');
  assert.equal(flightStatus('Något helt annat', 'en'), 'Något helt annat');
});
