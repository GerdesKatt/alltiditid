import React from 'react';
import type { InfoTab } from '../lib/types';
import { colors } from './styles';
import { ANALYTICS_ENABLED } from '../lib/analytics';
import { useLang } from '../lib/i18n';

type Props = {
  activeTab: InfoTab;
  onChangeAnalyticsChoice: () => void;
  onTabChange: (tab: InfoTab) => void;
};

const TABS: { key: InfoTab; label: string; labelEn: string }[] = [
  { key: 'about', label: 'Om alltid i tid', labelEn: 'About alltid i tid' },
  { key: 'privacy', label: 'Integritet', labelEn: 'Privacy' },
  { key: 'terms', label: 'Ansvarsfriskrivning', labelEn: 'Disclaimer' },
  { key: 'contact', label: 'Kontakt', labelEn: 'Contact' },
];

const tabText = { lineHeight: 1.6, margin: '0 0 14px 0' } as const;
const privacyPara = { margin: '0 0 10px 0' } as const;
const privacyItem = { marginBottom: '8px' } as const;

const choiceButton = {
  padding: 0,
  border: 'none',
  background: 'none',
  color: colors.accent,
  textDecoration: 'underline',
  font: 'inherit',
  cursor: 'pointer',
} as const;

function TabContentEn({ tab, onChangeAnalyticsChoice }: { tab: InfoTab; onChangeAnalyticsChoice: () => void }) {
  switch (tab) {
    case 'about':
      return (
        <p style={tabText}>
          alltid i tid is an independent information service showing current departure times, arrivals and delay
          data based on open traffic data.
        </p>
      );
    case 'privacy':
      return (
        <div style={{ lineHeight: 1.6, margin: '0 0 14px 0' }}>
          <p style={privacyPara}>
            alltid i tid has no accounts and shows no ads. Cookies are only used for statistics, and only if you have
            agreed to it. This is how the little that is needed is handled:
          </p>
          <ul style={{ margin: '0 0 10px 0', paddingLeft: '20px' }}>
            <li style={privacyItem}>
              <strong>Saved stops.</strong> The stop and direction you last looked at, the stops you save yourself with
              ☆ Save, whether you chose List or By line, and your language are stored in your browser (local storage),
              so the site opens there next time. They stay on your device and are not used for anything else. You remove
              them by clearing site data for alltiditid.se in your browser. The stop is also in the page address, so you
              can share or bookmark the board.
            </li>
            <li style={privacyItem}>
              <strong>Stops near me.</strong> Your location is only used when you tap the button yourself and have
              allowed location access. It is rounded to about 100 metres on your phone before being sent to our server
              and on to Trafiklab (ResRobot) to find the nearest stops. The location is not stored and not linked to
              you. A response for the same rounded location is cached for at most 5 minutes.
            </li>
            <li style={privacyItem}>
              <strong>Where to?</strong> When you search for an address, a hotel or another place, our server sends
              what you typed to a geocoding service (Geoapify, or Photon run by komoot in Germany) to find the place.
              Nothing about you is sent. The answer for the same search may be cached for up to 7 days, not linked to
              you.
            </li>
            <li style={privacyItem}>
              <strong>Can I make it?</strong> When you turn on walking time, your location is followed while the
              board is open. The walking time is calculated in your browser, and the location is never sent anywhere
              and never stored. Only your choice (on or off, and walking pace) is saved in local storage. Turn it off
              with Turn off.
            </li>
            <li style={privacyItem}>
              <strong>Departure boards.</strong> When you view a board, our server fetches departures from Trafiklab,
              Trafikverket, SL and Västtrafik. Only the stop&apos;s id and name are sent, nothing about you.
            </li>
            <li style={privacyItem}>
              <strong>Did you know?</strong> The facts about a place come from Wikipedia. Our server asks Wikipedia
              for articles near the stop, sending only the stop&apos;s name and location, nothing about you. The text
              is licensed under CC BY-SA and the article is always linked.
            </li>
            <li style={privacyItem}>
              <strong>I&apos;m on board.</strong> The status message is created on your phone and shared using the
              phone&apos;s own share feature. We do not receive or store the message.
            </li>
            <li style={privacyItem}>
              <strong>Visitor statistics.</strong> We use Cloudflare Web Analytics to see how many people visit the
              site and how fast it loads. It sets no cookies, stores nothing in your browser and does not follow you
              between sites. We only see aggregated numbers, never individual visitors.
            </li>
            <li style={privacyItem}>
              <strong>Our own counts.</strong> To see whether the site works, we count a few events per day, such
              as how fast the first departure appears and whether a search is abandoned. No cookies, no IP address
              and nothing that identifies you is stored: only a day, an event name and a tally. Once a day we
              also count on how many different days in the past week you looked at a board (a number from 1 to
              7), based on the stops already saved for Home. We also count where the visit came from, as the
              name of the site you followed a link from (such as reddit or google), never the full address.
            </li>
            <li style={privacyItem}>
              <strong>Suggestions and filters.</strong> Which lines you open and which mode you picked at a stop
              are remembered only in your own browser, so the site can suggest your usual trip. Nothing is sent to us.
            </li>
            {ANALYTICS_ENABLED ? (
              <li style={privacyItem}>
                <strong>Google Analytics (only if you accept).</strong> With your consent we also use Google Analytics
                to see which features are used. Cookies are then set and information about the visit, such as page
                views, approximate location based on IP address and device type, is sent to Google, which may process
                it in the USA. Ads and personalised advertising are turned off. If you decline, nothing is loaded from
                Google.{' '}
                <button type="button" onClick={onChangeAnalyticsChoice} style={choiceButton}>
                  Change your statistics choice
                </button>
              </li>
            ) : null}
            <li style={privacyItem}>
              <strong>Hosting.</strong> The site and server are run by Cloudflare, which receives your IP address to
              deliver the page and protect it against attacks. We do not store IP addresses.
            </li>
          </ul>
          <p style={privacyPara}>
            <strong>Data controller.</strong> Nils Gerdes, who runs alltid i tid as a private individual, is the
            controller for the personal data described here. Contact: kontakt@alltiditid.se.
          </p>
          <p style={privacyPara}>
            <strong>Legal basis.</strong> Most of the site handles no personal data at all. Your IP address at
            Cloudflare, the location you choose to use and what you type in the place search are handled on the basis
            of legitimate interest: delivering and protecting the site and giving you what you asked for. We use no
            analytics cookies and no Google Analytics.
          </p>
          <p style={privacyPara}>
            <strong>Your rights.</strong> You can ask what data we hold about you, and have it corrected or deleted.
            You can object to processing. Email kontakt@alltiditid.se. You also have the right
            to complain to the Swedish Authority for Privacy Protection (IMY), imy.se.
          </p>
          <p style={privacyPara}>Last updated 27 November 2026.</p>
        </div>
      );
    case 'terms':
      return (
        <p style={tabText}>
          Real-time data can change at short notice during disruptions. Always check the operator&apos;s official
          information on site before you travel.
        </p>
      );
    case 'contact':
      return (
        <p style={tabText}>
          Questions, feedback or ideas for improvements? Email us at{' '}
          <a href="mailto:kontakt@alltiditid.se" style={{ color: colors.accent, textDecoration: 'underline' }}>
            kontakt@alltiditid.se
          </a>
          .
        </p>
      );
  }
}

function TabContent({ tab, onChangeAnalyticsChoice }: { tab: InfoTab; onChangeAnalyticsChoice: () => void }) {
  switch (tab) {
    case 'about':
      return (
        <p style={tabText}>
          alltid i tid är en oberoende informationstjänst som visar aktuella avgångstider,
          ankomster och förseningsdata baserat på öppna trafikdata.
        </p>
      );
    case 'privacy':
      return (
        <div style={{ lineHeight: 1.6, margin: '0 0 14px 0' }}>
          <p style={privacyPara}>
            alltid i tid har inga konton och visar inga annonser. Kakor används bara för statistik,
            och bara om du har godkänt det. Så här hanteras det lilla som behövs:
          </p>
          <ul style={{ margin: '0 0 10px 0', paddingLeft: '20px' }}>
            <li style={privacyItem}>
              <strong>Sparade hållplatser.</strong> Den hållplats och riktning du senast tittade på,
              de hållplatser du själv sparar med ☆ Spara, om du valt Lista eller Per linje och ditt språkval lagras i din webbläsare (local
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
              <strong>Vart ska du?</strong> När du söker en adress, ett hotell eller en annan plats skickar vår server
              det du skrivit till en tjänst som hittar platser (Geoapify, eller Photon som drivs av komoot i
              Tyskland). Inget om dig skickas. Svaret på samma sökning kan mellanlagras i upp till 7 dagar, utan
              koppling till dig.
            </li>
            <li style={privacyItem}>
              <strong>Hinner jag dit?</strong> När du slår på gångtid följs din position medan tavlan är öppen.
              Gångtiden räknas i din webbläsare, och positionen skickas aldrig någonstans och sparas inte. Bara ditt
              val (på eller av, och gångtakt) sparas i local storage. Du stänger av med Stäng av.
            </li>
            <li style={privacyItem}>
              <strong>Avgångstavlor.</strong> När du visar en tavla hämtar vår server avgångar från
              Trafiklab, Trafikverket, SL och Västtrafik. Där skickas bara hållplatsens id och namn,
              inget om dig.
            </li>
            <li style={privacyItem}>
              <strong>Visste du?</strong> Kuriosan om platsen kommer från Wikipedia. Vår server frågar Wikipedia
              efter artiklar nära hållplatsen, och skickar bara hållplatsens namn och läge, inget om dig. Texten
              har licensen CC BY-SA och artikeln länkas alltid.
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
            <li style={privacyItem}>
              <strong>Egna räkningar.</strong> För att se om sajten fungerar räknar vi några händelser
              per dag, till exempel hur snabbt första avgången syns och om en sökning avbryts. Inga
              kakor, ingen IP-adress och inget som pekar ut dig sparas: bara dag, händelse och antal.
              En gång per dag räknar vi också hur många olika dagar den senaste veckan du tittat på en
              tavla (ett tal mellan 1 och 7), utifrån hållplatserna som redan sparas för Hem. Vi räknar
              också varifrån besöket kom, som namnet på sajten du följde en länk från (till exempel
              reddit eller google), aldrig hela adressen.
            </li>
            <li style={privacyItem}>
              <strong>Förslag och filter.</strong> Vilka linjer du öppnar och vilket trafikslag du valt
              på en hållplats sparas bara i din egen webbläsare, så att sajten kan föreslå din vanliga
              resa. Inget skickas till oss.
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
            <strong>Personuppgiftsansvarig.</strong> Nils Gerdes, som driver alltid i tid som privatperson, är
            personuppgiftsansvarig för de uppgifter som beskrivs här. Kontakt: kontakt@alltiditid.se.
          </p>
          <p style={privacyPara}>
            <strong>Rättslig grund.</strong> Det mesta på sajten hanterar inga personuppgifter alls. Din IP-adress hos
            Cloudflare, positionen du själv väljer att använda och det du skriver i platssökningen hanteras med stöd
            av berättigat intresse: att leverera och skydda sajten och ge dig det du bett om. Vi använder inga
            analyskakor och inte Google Analytics.
          </p>
          <p style={privacyPara}>
            <strong>Dina rättigheter.</strong> Du kan begära att få veta vilka uppgifter vi har om dig och få dem
            rättade eller raderade. Du kan också invända mot behandlingen. Mejla
            kontakt@alltiditid.se. Du har rätt att klaga hos Integritetsskyddsmyndigheten (IMY), imy.se.
          </p>
          <p style={privacyPara}>Senast uppdaterad 27 november 2026.</p>
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
  const { lang, t } = useLang();
  const Content = lang === 'en' ? TabContentEn : TabContent;
  return (
    <footer
      id="sidfot"
      style={{
        borderTop: `1px solid ${colors.border}`,
        paddingTop: '20px',
        paddingBottom: '24px',
        color: colors.textDim,
        fontSize: '0.8125rem',
      }}
    >
      {/* Sidfoten väger lätt: samma understrukna flikar som tavlans filter, inga inramade knappar. */}
      <div style={{ display: 'flex', columnGap: '18px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={activeTab === tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              minHeight: '44px',
              padding: '0 2px',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.key ? colors.text : 'transparent'}`,
              borderRadius: 0,
              backgroundColor: 'transparent',
              color: activeTab === tab.key ? colors.text : colors.textDim,
              cursor: 'pointer',
              fontSize: '0.8125rem',
              fontWeight: 600,
            }}
          >
            {t(tab.label, tab.labelEn)}
          </button>
        ))}
      </div>

      <Content tab={activeTab} onChangeAnalyticsChoice={onChangeAnalyticsChoice} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '0.8125rem',
          color: colors.textFaint,
        }}
      >
        <span>{t('2026 alltid i tid (alltiditid.se) – Alla rättigheter förbehållna.', '2026 alltid i tid (alltiditid.se) – All rights reserved.')}</span>
        <a
          href="mailto:kontakt@alltiditid.se"
          style={{ color: colors.textDim, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}
        >
          kontakt@alltiditid.se
        </a>
      </div>
    </footer>
  );
}
