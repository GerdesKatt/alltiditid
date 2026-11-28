import test from 'node:test';
import assert from 'node:assert/strict';
import { shortLinkTarget } from '../lib/shortLink.mjs';
import { sourceLabel } from '../lib/source.mjs';

test('kort länk till startsidan, en hållplats och en flygplats', () => {
  assert.equal(shortLinkTarget('/q/cafe-x'), '/?utm_source=qr-cafe-x');
  assert.equal(shortLinkTarget('/q/cafe-x/'), '/?utm_source=qr-cafe-x');
  assert.equal(shortLinkTarget('/q/Cafe-X/Slussen'), '/slussen?utm_source=qr-cafe-x');
  assert.equal(shortLinkTarget('/q/hotell-y/flyg/arlanda'), '/flyg/arlanda?utm_source=qr-hotell-y');
});

test('allt annat är ingen kort länk', () => {
  assert.equal(shortLinkTarget('/'), null);
  assert.equal(shortLinkTarget('/q'), null);
  assert.equal(shortLinkTarget('/slussen'), null);
  assert.equal(shortLinkTarget('/q/cafe x'), null);
  assert.equal(shortLinkTarget('/q/a/b/c'), null);
  assert.equal(shortLinkTarget('/q/a/..'), null);
  assert.equal(shortLinkTarget('/q/a/%2F%2Fevil.com'), null);
  assert.equal(shortLinkTarget('/q/' + 'a'.repeat(30)), null);
});

test('koden blir källan i mätningen', () => {
  const target = shortLinkTarget('/q/cafe-x/slussen');
  assert.equal(sourceLabel('', target.slice(target.indexOf('?')), 'alltiditid.se'), 'qr-cafe-x');
});
