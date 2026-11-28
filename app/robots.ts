import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/statistik'] }],
    sitemap: 'https://alltiditid.se/sitemap.xml',
  };
}
