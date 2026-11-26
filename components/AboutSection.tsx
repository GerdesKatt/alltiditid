import React from 'react';
import { colors } from './styles';

const paragraph = { color: colors.textDim, fontSize: '0.875rem', lineHeight: 1.65 } as const;

export default function AboutSection() {
  return (
    <section
      id="om-tjansten"
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '26px',
      }}
    >
      <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 10px 0', color: colors.text }}>
        Så fungerar avgångstavlan på alltiditid.se
      </h2>
      <p style={{ ...paragraph, margin: '0 0 12px 0' }}>
        På <strong style={{ color: colors.textSoft }}>alltiditid.se</strong> samlar vi realtidsinformation
        om kollektivtrafik i Sverige så att du snabbt kan se när nästa tåg, T-bana, spårvagn,
        pendel eller buss avgår eller ankommer, om den är i tid eller försenad samt vilket spår
        eller läge som gäller.
      </p>
      <p style={{ ...paragraph, margin: '0 0 12px 0' }}>
        Sitter du redan ombord? Växla till <strong>Ankomster</strong> på din avstigningsstation
        (t.ex. Lund C), filtrera på linje eller tågnummer och klicka på{' '}
        <strong>Jag är ombord</strong> för att skicka din status till den som hämtar dig.
      </p>
      <p style={{ ...paragraph, margin: 0 }}>
        Lägg alltiditid.se på hemskärmen så öppnas den som en app. På iPhone: tryck på{' '}
        <strong>Dela</strong> och välj <strong>Lägg till på hemskärmen</strong>. På Android: öppna
        menyn i Chrome och välj <strong>Installera app</strong>. Utan nät visas den senast hämtade
        tavlan.
      </p>
    </section>
  );
}
