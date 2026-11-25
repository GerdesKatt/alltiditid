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
    apple: '/icon.svg',
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
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
          backgroundColor: '#020617',
          color: '#f8fafc',
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
