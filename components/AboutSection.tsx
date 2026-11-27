import React from 'react';
import { colors } from './styles';
import { useLang } from '../lib/i18n';

const paragraph = { color: colors.textDim, fontSize: '0.875rem', lineHeight: 1.65 } as const;

export default function AboutSection() {
  const { lang } = useLang();
  return (
    // Ihopfälld: texten finns kvar för den som vill läsa (och för sökmotorer) men tar ingen plats från tavlan.
    <details id="om-tjansten" className="om-tjansten" style={{ borderTop: `1px solid ${colors.border}`, margin: '8px 0 26px' }}>
      <summary style={{ minHeight: '48px', display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: colors.textDim }}>
        {lang === 'en' ? 'About alltid i tid' : 'Om alltid i tid'}
      </summary>
      <div style={{ padding: '4px 0 8px' }}>
      {lang === 'en' ? (
        <>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 10px 0', color: colors.text }}>
            How the departure board on alltiditid.se works
          </h2>
          <p style={{ ...paragraph, margin: '0 0 12px 0' }}>
            <strong style={{ color: colors.textSoft }}>alltiditid.se</strong> collects real-time information about
            public transport in Sweden, so you can quickly see when the next train, metro, tram, commuter train or bus
            departs or arrives, whether it is on time or delayed, and which track or stand it uses.
          </p>
          <p style={{ ...paragraph, margin: '0 0 12px 0' }}>
            Already on board? Switch to <strong>Arrivals</strong> at the station where you get off (e.g. Lund C),
            filter by line or train number and tap <strong>I&apos;m on board</strong> to send your status to whoever is
            picking you up.
          </p>
          <p style={{ ...paragraph, margin: 0 }}>
            Add alltiditid.se to your home screen and it opens like an app. On iPhone: tap <strong>Share</strong> and
            choose <strong>Add to Home Screen</strong>. On Android: open the Chrome menu and choose{' '}
            <strong>Install app</strong>. Without a connection, the most recently loaded board is shown.
          </p>
        </>
      ) : (
        <>
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
        </>
      )}
      </div>
    </details>
  );
}
