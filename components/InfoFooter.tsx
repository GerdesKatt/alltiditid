import React from 'react';
import type { InfoTab } from '../lib/types';
import { colors } from './styles';
import { ANALYTICS_ENABLED } from '../lib/analytics';

type Props = {
  activeTab: InfoTab;
  onChangeAnalyticsChoice: () => void;
  onTabChange: (tab: InfoTab) => void;
};

const TABS: { key: InfoTab; label: string }[] = [
  { key: 'about', label: 'Om alltiditid.se' },
  { key: 'privacy', label: 'Integritet' },
  { key: 'terms', label: 'Ansvarsfriskrivning' },
  { key: 'contact', label: 'Kontakt' },
];

const tabText = { lineHeight: 1.6, margin: '0 0 14px 0' } as const;
const privacyPara = { margin: '0 0 10px 0' } as const;
const privacyItem = { marginBottom: '8px' } as const;

function TabContent({ tab, onChangeAnalyticsChoice }: { tab: InfoTab; onChangeAnalyticsChoice: () => void }) {
  switch (tab) {
    case 'about':
      return (
        <p style={tabText}>
          alltiditid.se är en oberoende informationstjänst som visar aktuella avgångstider,
          ankomster och förseningsdata baserat på öppna trafikdata.
        </p>
      );
    case 'privacy':
      return (
        <div style={{ lineHeight: 1.6, margin: '0 0 14px 0' }}>
          <p style={privacyPara}>
            alltiditid.se har inga konton och visar inga annonser. Kakor används bara för statistik,
            och bara om du har godkänt det. Så här hanteras det lilla som behövs:
          </p>
          <ul style={{ margin: '0 0 10px 0', paddingLeft: '20px' }}>
            <li style={privacyItem}>
              <strong>Sparade hållplatser.</strong> Den hållplats och riktning du senast tittade på,
              de hållplatser du själv sparar med ☆ Spara och om du valt Lista eller Per linje lagras i din webbläsare (local
              storage), så att sidan öppnas där nästa gång. De stannar på din enhet och används inte
              till något annat. Du tar bort dem genom att
              rensa webbplatsdata för alltiditid.se i webbläsaren. Hållplatsen står också i sidans
              adress, så att du kan dela eller bokmärka tavlan.
            </li>
            <li style={privacyItem}>
              <strong>Hållplatser nära mig.</strong> Din position används bara när du själv trycker
              på knappen och har tillåtit platsåtkomst. Den avrundas till ungefär 100 meter i din
              telefon innan den skickas till vår server och vidare till Trafiklab (ResRobot) för att
              hitta närmaste hållplatser. Positionen sparas inte och kopplas inte till dig. Ett svar
              för samma avrundade position mellanlagras i högst 5 minuter.
            </li>
            <li style={privacyItem}>
              <strong>Avgångstavlor.</strong> När du visar en tavla hämtar vår server avgångar från
              Trafiklab, Trafikverket, SL och Västtrafik. Där skickas bara hållplatsens id och namn,
              inget om dig.
            </li>
            <li style={privacyItem}>
              <strong>Jag är ombord.</strong> Statusmeddelandet skapas i din telefon och delas via
              telefonens egen delningsfunktion. Vi tar inte emot och sparar inte meddelandet.
            </li>
            <li style={privacyItem}>
              <strong>Besöksstatistik.</strong> Vi använder Cloudflare Web Analytics för att se hur
              många som besöker sajten och hur snabbt den laddar. Den sätter inga kakor, sparar
              ingenting i din webbläsare och följer dig inte mellan sajter. Vi ser bara
              sammanräknade siffror, aldrig enskilda besökare.
            </li>
            {ANALYTICS_ENABLED ? (
              <li style={privacyItem}>
                <strong>Google Analytics (bara om du godkänner).</strong> Med ditt samtycke
                använder vi också Google Analytics för att se vilka funktioner som används. Då
                sätts kakor och uppgifter om besöket, som sidvisningar, ungefärlig plats utifrån
                IP-adress och enhetstyp, skickas till Google, som kan behandla dem i USA. Annonser
                och personanpassad reklam är avstängt. Nekar du laddas ingenting från Google.{' '}
                <button
                  type="button"
                  onClick={onChangeAnalyticsChoice}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    color: colors.accent,
                    textDecoration: 'underline',
                    font: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  Ändra ditt val om statistik
                </button>
              </li>
            ) : null}
            <li style={privacyItem}>
              <strong>Drift.</strong> Sajten och servern drivs av Cloudflare, som tar emot din
              IP-adress för att kunna leverera sidan och skydda den mot attacker. Vi sparar inga
              IP-adresser.
            </li>
          </ul>
          <p style={privacyPara}>
            Frågor om hur dina uppgifter hanteras? Mejla kontakt@alltiditid.se.
          </p>
        </div>
      );
    case 'terms':
      return (
        <p style={tabText}>
          Realtidsdata kan ändras med kort varsel vid trafikstörningar. Kontrollera alltid
          operatörens officiella information på plats innan avresa.
        </p>
      );
    case 'contact':
      return (
        <p style={tabText}>
          Har du frågor, synpunkter eller förslag på förbättringar? Kontakta oss via e-post på{' '}
          <a
            href="mailto:kontakt@alltiditid.se"
            style={{ color: colors.accent, textDecoration: 'underline' }}
          >
            kontakt@alltiditid.se
          </a>
          .
        </p>
      );
  }
}

export default function InfoFooter({ activeTab, onTabChange, onChangeAnalyticsChoice }: Props) {
  return (
    <footer
      id="sidfot"
      style={{
        borderTop: `1px solid ${colors.border}`,
        paddingTop: '20px',
        paddingBottom: '24px',
        color: colors.textDim,
        fontSize: '13px',
      }}
    >
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={activeTab === tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: activeTab === tab.key ? colors.surfaceRaised : 'transparent',
              color: colors.text,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <TabContent tab={activeTab} onChangeAnalyticsChoice={onChangeAnalyticsChoice} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '12px',
          color: colors.textFaint,
        }}
      >
        <span>2026 alltiditid.se – Alla rättigheter förbehållna.</span>
        <a href="mailto:kontakt@alltiditid.se" style={{ color: colors.textDim, textDecoration: 'none' }}>
          kontakt@alltiditid.se
        </a>
      </div>
    </footer>
  );
}
