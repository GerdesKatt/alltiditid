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
        {lang === 'en' ? 'How alltid i tid works' : 'Så funkar alltid i tid'}
      </summary>
      <div style={{ padding: '4px 0 8px' }}>
      {lang === 'en' ? (
        <>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 10px 0', color: colors.text }}>
            Departures, trips and flights in one place
          </h2>
          <p style={{ ...paragraph, margin: '0 0 12px 0' }}>
            <strong style={{ color: colors.textSoft }}>alltid i tid</strong> shows real-time departures for buses,
            metro, commuter trains, trams, trains and boats all over Sweden: when the next one leaves, whether it is on
            time and which track or stand applies.
          </p>
          <p style={{ ...paragraph, margin: '0 0 12px 0' }}>
            Type a stop, an address or a train number in the search field. A stop opens its departure board, an address
            plans the whole trip from where you are, and a train number lets you follow the train along its route. Save
            the trip under <strong>My trip</strong> and it is there next time. Under <strong>Flights</strong> you find
            departures and security wait times at Swedish airports.
          </p>
          <p style={{ ...paragraph, margin: '0 0 12px 0' }}>
            Being picked up? Tap your departure and choose <strong>I&apos;m on board</strong> to send the person meeting
            you a message saying which bus or train you are on and whether it is on time.
          </p>
          <p style={{ ...paragraph, margin: 0 }}>
            Add alltid i tid to your home screen and it opens like an app. On iPhone: tap <strong>Share</strong> and
            choose <strong>Add to Home Screen</strong>. On Android: open the Chrome menu and choose{' '}
            <strong>Install app</strong>.
          </p>
        </>
      ) : (
        <>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 10px 0', color: colors.text }}>
            Avgångar, resor och flyg på ett ställe
          </h2>
          <p style={{ ...paragraph, margin: '0 0 12px 0' }}>
            <strong style={{ color: colors.textSoft }}>alltid i tid</strong> visar avgångar i realtid för bussar,
            tunnelbana, pendeltåg, spårvagnar, tåg och båtar i hela Sverige: när nästa går, om den är i tid och vilket
            spår eller läge som gäller.
          </p>
          <p style={{ ...paragraph, margin: '0 0 12px 0' }}>
            Skriv en hållplats, en adress eller ett tågnummer i sökfältet. En hållplats öppnar dess avgångstavla, en
            adress planerar hela resan från där du står, och ett tågnummer låter dig följa tåget längs sträckan. Spara
            resan under <strong>Min resa</strong> så finns den där nästa gång. Under <strong>Flyg</strong> ser du
            avgångar och väntetider i säkerhetskontrollen på svenska flygplatser.
          </p>
          <p style={{ ...paragraph, margin: '0 0 12px 0' }}>
            Ska någon hämta dig? Tryck på din avgång och välj <strong>Jag är ombord</strong>, så skickar du ett meddelande
            till den som möter dig om vilken buss eller vilket tåg du sitter på och om den är i tid.
          </p>
          <p style={{ ...paragraph, margin: 0 }}>
            Lägg alltid i tid på hemskärmen så öppnas den som en app. På iPhone: tryck på <strong>Dela</strong> och
            välj <strong>Lägg till på hemskärmen</strong>. På Android: öppna menyn i Chrome och välj{' '}
            <strong>Installera app</strong>.
          </p>
        </>
      )}
      </div>
    </details>
  );
}
