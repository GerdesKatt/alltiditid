import type { MetadataRoute } from 'next';
import { CITY_PAGES, STOP_PAGES } from '../lib/stops';

export const dynamic = 'force-static';

const SITE = 'https://alltiditid.se';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/hallplatser`, changeFrequency: 'weekly', priority: 0.6 },
    ...CITY_PAGES.map((c) => ({
      url: `${SITE}/avgangar/${c.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...STOP_PAGES.map((s) => ({
      url: `${SITE}/${s.slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
