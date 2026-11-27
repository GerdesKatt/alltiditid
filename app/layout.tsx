import type { Metadata } from 'next';
import React from 'react';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/schibsted-grotesk/wght.css';
import './globals.css';
import { THEME_SCRIPT } from '../lib/theme';
import { PREFETCH_SCRIPT } from '../lib/prefetch';

export const metadata: Metadata = {
  title: 'alltid i tid – avgångar och ankomster i realtid',
  description: 'Koll på avgångar, ankomster och förseningar i realtid.',
  icons: {
    icon: [
      { url: '/icon-v2.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon-v2.svg',
    apple: '/apple-touch-icon-v2.png',
  },
  manifest: '/manifest.webmanifest',
  metadataBase: new URL('https://alltiditid.se'),
  // Delningsbilden. functions/_middleware.js byter titel och text till hållplatsens
  // namn när en länk som /?h=…&n=Gullmarsplan delas.
  openGraph: {
    type: 'website',
    locale: 'sv_SE',
    siteName: 'alltid i tid',
    url: 'https://alltiditid.se/',
    title: 'alltid i tid – nästa avgång, i realtid',
    description: 'Avgångar, ankomster och förseningar i realtid för hela Sverige. Utan reklam, utan konto.',
    images: [{ url: '/og-v2.png', width: 1200, height: 630, alt: 'alltid i tid: nästa avgång, i realtid' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'alltid i tid – nästa avgång, i realtid',
    description: 'Avgångar, ankomster och förseningar i realtid för hela Sverige.',
    images: ['/og-v2.png'],
  },
  appleWebApp: {
    capable: true,
    // Namnet under ikonen på hemskärmen.
    title: 'alltid i tid',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <head>
        {/* Startar hämtningen av tavlan innan React har laddat (lib/prefetch.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: PREFETCH_SCRIPT }} />
        <meta name="theme-color" content="#0e0e0e" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#f4f2ec" media="(prefers-color-scheme: light)" />
        {/*
          Google Analytics laddas inte här utan i lib/analytics.ts, och bara om ett
          mätnings-id finns och efter samtycke via ConsentBanner.

          Google AdSense är avstängt tills vidare. Annonskakor kräver samtycke
          (9 kap. 28 § LEK), och Google kräver en certifierad samtyckesruta (CMP med
          IAB TCF) för annonser i EES. Lägg tillbaka skriptet först tillsammans med en
          sådan, och uppdatera integritetstexten i components/InfoFooter.tsx:
          https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9262819807175676
        */}
      </head>
      <body
        style={{
          margin: 0,
          padding: '20px 16px',
          backgroundColor: 'var(--c-bg)',
          color: 'var(--c-text)',
          fontFamily: 'var(--font-text)',
        }}
      >
        {children}
      </body>
    </html>
  );
}
