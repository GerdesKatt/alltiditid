// Störningstexter: ett språk i taget, och bara texter som säger något (UX-revisionen, fynd 6 och 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saysSomething, textInLanguage } from '../lib/disruptionText.mjs';

const both = 'Tåg mot Hagsätra avgår från Gullmarsplan. Trains bound for Hagsätra depart from Gullmarsplan.';

test('svenska och engelska i samma text delas', () => {
  assert.equal(textInLanguage(both, 'sv'), 'Tåg mot Hagsätra avgår från Gullmarsplan.');
  assert.equal(textInLanguage(both, 'en'), 'Trains bound for Hagsätra depart from Gullmarsplan.');
  const sv = 'Gamla stan: Hissen till och från plattformen mot Gullmarsplan och Liljeholmen är avstängd. Läs mer på sl.se.';
  assert.equal(textInLanguage(sv, 'sv'), sv);
  assert.equal(textInLanguage(sv, 'en'), sv);
});

test('en rubrik utan händelse är ingen störning', () => {
  for (const x of ['Buss', 'Åkareplatsen', 'NE Terminalen', 'Buss 22K']) assert.equal(saysSomething(x), false, x);
  for (const x of ['Inställda avgångar', 'Hissen är avstängd', 'Förseningar och inställda avgångar']) assert.equal(saysSomething(x), true, x);
});
