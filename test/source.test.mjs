import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLabel } from '../lib/source.mjs';

test('källa: kända sajter får korta namn', () => {
  assert.equal(sourceLabel('https://www.reddit.com/r/stockholm/comments/abc', '', 'alltiditid.se'), 'reddit');
  assert.equal(sourceLabel('https://l.facebook.com/l.php?u=x', '', 'alltiditid.se'), 'facebook');
  assert.equal(sourceLabel('https://www.google.se/', '', 'alltiditid.se'), 'google');
  assert.equal(sourceLabel('https://t.co/xyz', '', 'alltiditid.se'), 'x');
});

test('källa: okänd sajt, direkt, egen sida och utm_source', () => {
  assert.equal(sourceLabel('https://www.feber.se/artikel/1', '', 'alltiditid.se'), 'feber_se');
  assert.equal(sourceLabel('', '', 'alltiditid.se'), 'direkt');
  assert.equal(sourceLabel('https://alltiditid.se/slussen', '', 'alltiditid.se'), '');
  assert.equal(sourceLabel('https://www.reddit.com/', '?utm_source=TikTok%20Ad', 'alltiditid.se'), 'tiktok_ad');
});
