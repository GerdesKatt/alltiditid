import React from 'react';
import type { InfoTab } from '../lib/types';
import { colors } from './styles';

type Props = {
  activeTab: InfoTab;
  onTabChange: (tab: InfoTab) => void;
};

const TABS: { key: InfoTab; label: string }[] = [
  { key: 'about', label: 'Om alltiditid.se' },
  { key: 'privacy', label: 'Integritetspolicy & cookies' },
  { key: 'terms', label: 'Ansvarsfriskrivning' },
  { key: 'contact', label: 'Kontakt' },
];

const tabText = { lineHeight: 1.6, margin: '0 0 14px 0' } as const;

function TabContent({ tab }: { tab: InfoTab }) {
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
        <p style={tabText}>
          Vi samlar inte in personuppgifter genom stationssökningar. Vid annonsering via tredje
          part (såsom Google AdSense) kan cookies eller liknande tekniker användas för att visa
          relevanta annonser och mäta trafik.
        </p>
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

export default function InfoFooter({ activeTab, onTabChange }: Props) {
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

      <TabContent tab={activeTab} />

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
