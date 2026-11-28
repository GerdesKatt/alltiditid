import type { Metadata } from 'next';
import React from 'react';
import EmbedBoard from '../../components/EmbedBoard';

// Inbäddningsbar avgångstavla (tillväxtplanen, ändring 6): /tavla?h=<id>&n=<namn> i en iframe
// hos ett hotell, ett kontor eller en förening. Koden hämtas under "Om stationen".
export const metadata: Metadata = {
  title: 'Avgångstavla | alltid i tid',
  robots: { index: false, follow: true },
};

export default function EmbedPage() {
  return <EmbedBoard />;
}
