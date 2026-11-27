// Varifrån besöket kom, som ett kort ord utan något som pekar ut besökaren:
// bara sajtens namn ur länken (reddit, facebook, google), aldrig hela adressen.

const KNOWN = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.me$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'x'],
  [/(^|\.)threads\.(net|com)$/, 'threads'],
  [/(^|\.)bsky\.app$/, 'bluesky'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
];

const clean = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

/**
 * "reddit", "google", "direkt" eller sajtens namn med _ i stället för punkter ("feber_se").
 * utm_source i adressen vinner. Tom sträng när besöket kom från en egen sida (ingen ny källa).
 */
export function sourceLabel(referrer, search, ownHost) {
  let utm = '';
  try {
    utm = new URLSearchParams(search || '').get('utm_source') || '';
  } catch {
    utm = '';
  }
  if (utm) return clean(utm) || 'okand';
  let host = '';
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase() : '';
  } catch {
    host = '';
  }
  if (!host) return 'direkt';
  const own = String(ownHost || '').toLowerCase().replace(/^www\./, '');
  const bare = host.replace(/^(www|m|l|lm|out|old|mobile)\./, '');
  if (own && (bare === own || bare.endsWith(`.${own}`) || bare === 'resx.se')) return '';
  for (const [re, name] of KNOWN) if (re.test(bare)) return name;
  return clean(bare) || 'okand';
}
