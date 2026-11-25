import type { Metadata } from 'next';
import React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'alltiditid.se – Avgångar och ankomster i realtid',
  description: 'Koll på avgångar, ankomster och förseningar i realtid.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'alltiditid',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <head>
        <meta name="theme-color" content="#020617" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#eef2f7" media="(prefers-color-scheme: light)" />
        {/*
          Google Analytics (GTM) laddas inte här utan i lib/analytics.ts, och bara efter
          samtycke via ConsentBanner.

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
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
