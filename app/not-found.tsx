import type { Metadata } from 'next';
import React from 'react';
import Header from '../components/Header';
import Tr from '../components/Tr';
import NotFoundHelp from '../components/NotFoundHelp';
import { colors } from '../components/styles';

export const metadata: Metadata = {
  title: 'Sidan finns inte | alltid i tid',
  robots: { index: false },
};

/** Egen 404 på svenska med väg tillbaka, i stället för Next.js engelska standardsida (UX-revisionen, fynd 9). */
export default function NotFound() {
  return (
    <div className="app-shell" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <Header linkBase="/" />
      <main id="innehall">
        <h1 style={{ fontSize: 'clamp(1.75rem, 7vw, 2.5rem)', fontWeight: 800, lineHeight: 1.05, margin: '8px 0 10px' }}>
          <Tr sv="Sidan finns inte" en="This page does not exist" />
        </h1>
        <p style={{ color: colors.textDim, margin: '0 0 18px', fontSize: '0.9375rem' }}>
          <Tr
            sv="Adressen stämmer inte med någon hållplats hos oss. Sök hållplatsen på startsidan, eller välj bland alla hållplatser."
            en="The address does not match any stop. Search for the stop on the home page, or pick from all stops."
          />
        </p>
        <p style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', margin: 0 }}>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', minHeight: '48px', padding: '0 18px', backgroundColor: colors.text, color: colors.bg, fontWeight: 700, textDecoration: 'none' }}>
            <Tr sv="Sök hållplats" en="Search for a stop" />
          </a>
          <a href="/hallplatser" style={{ display: 'inline-flex', alignItems: 'center', minHeight: '48px', padding: '0 18px', border: `1px solid ${colors.text}`, color: colors.text, fontWeight: 700, textDecoration: 'none' }}>
            <Tr sv="Alla hållplatser" en="All stops" />
          </a>
        </p>
        <NotFoundHelp />
      </main>
    </div>
  );
}
