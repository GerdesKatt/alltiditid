// Cachenycklar för tavlor och sök (functions/api/trafik.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardRequestUrl, searchCacheKey } from '../functions/api/trafik.js';

const u = (s) => new URL(`https://alltiditid.se/api/trafik?${s}`);

test('extra och omkastade parametrar ger samma tavla', () => {
  const a = boardRequestUrl(u('action=departures&stopId=740021705&stopName=Gullmarsplan&mode=all&direction=departures'));
  const b = boardRequestUrl(u('direction=departures&x=123&stopName=Gullmarsplan&stopId=740021705&mode=all&_=99'));
  assert.equal(a.toString(), b.toString());
});

test('okänt trafikslag och riktning blir standardvärdena', () => {
  const url = boardRequestUrl(u('stopId=740021705&stopName=Gullmarsplan&mode=hack&direction=sideways'));
  assert.equal(url.searchParams.get('mode'), 'all');
  assert.equal(url.searchParams.get('direction'), 'departures');
});

test('tid följer bara med i rätt format', () => {
  assert.equal(boardRequestUrl(u('stopId=1&time=2026-11-27T08:15')).searchParams.get('time'), '2026-11-27T08:15');
  assert.equal(boardRequestUrl(u('stopId=1&time=imorgon')).searchParams.has('time'), false);
});

test('sökord med olika skiftläge och mellanslag delar cache', () => {
  assert.equal(searchCacheKey(u('action=search&q=Gullmarsplan')).url, searchCacheKey(u('action=search&q=%20gullmarsplan%20')).url);
  assert.notEqual(searchCacheKey(u('q=slussen')).url, searchCacheKey(u('q=gullmarsplan')).url);
});
