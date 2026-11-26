# alltiditid.se

Avgångar och ankomster i realtid för kollektivtrafik i hela Sverige: tåg, pendel, T-bana, spårvagn, buss och båt.

## Funktioner

- **Avgångar och ankomster** för valfri station eller hållplats, med förseningar, nya tider, spår/läge och avvikelser.
- **Snabbval per region:** Hela Sverige, Stockholm, Göteborg och Skåne.
- **Filter** på trafikslag och fritext (linje, tågnummer, destination, operatör, via-stopp).
- **"Jag är ombord"**: välj din resa och skicka ett färdigt statusmeddelande till den som ska hämta dig (delning eller kopiering).
- **Störningsruta** med länk till Hallå konsuments information om reseersättning när något är försenat eller inställt.
- **Svenska och engelska.** Språket följer webbläsaren (svenska om svenska kommer före engelska i språklistan, annars engelska) och kan bytas med knappen uppe till höger. Valet sparas i webbläsaren.

## Språk

Texterna skrivs på plats som `t('svensk text', 'English text')` med `useLang()` från `lib/i18n.ts`. Rena hjälpfunktioner utan React (linjenamn, trafikslag, tal) finns i `lib/lang.ts`, så att även servern kan använda dem. I sidor som renderas på servern används `<Tr sv="…" en="…" />`. Sidorna byggs på svenska; i webbläsaren byts texten direkt efter laddning. Text från trafikbolagen (störningar, avvikelser, flygplatsnamn) visas som de skickar den.

## Teknik

| Del | Teknik |
| --- | --- |
| Frontend | Next.js 14 (App Router), React 18, TypeScript, statisk export (`output: 'export'`) |
| API | Cloudflare Pages Function i `functions/api/trafik.js` (nås på `/api/trafik`) |
| Datakällor | [Trafiklab Realtime APIs](https://www.trafiklab.se/api/our-apis/trafiklab-realtime-apis/) (tavlor och hållplatser, med ResRobot som reserv) och [Trafikverkets öppna API](https://api.trafikinfo.trafikverket.se/) (tåg) |
| Hosting | Cloudflare Pages |

## Projektstruktur

```
app/
  layout.tsx          Rotlayout och metadata (AdSense är avstängt, se kommentaren i filen)
  page.tsx            Startsidan: state, datahämtning och filtrering
components/
  Header.tsx          Sidhuvud med logga och meny
  OnBoardPanel.tsx    "Jag är ombord"-läget
  SearchPanel.tsx     Region, station, riktning, trafikslag, sök och filter
  DisruptionBanner.tsx
  DepartureBoard.tsx  Avgångstavlan
  DepartureRow.tsx    En rad i tavlan
  AboutSection.tsx
  InfoFooter.tsx      Sidfot med flikar (om, integritet, villkor, kontakt)
  styles.ts           Färgpalett och delade stilar
lib/
  types.ts            Gemensamma typer
  regions.ts          Regioner, snabbvalsstationer och trafikslag
  shareMessage.ts     Bygger statusmeddelandet för "Jag är ombord"
functions/api/
  trafik.js           API: ?action=search och ?action=departures
public/
  icon.svg
```

## API

`GET /api/trafik?action=search&q=<text>` returnerar `{ stops: [{ id, name }] }`.

`POST /api/trafik?action=nearby` med JSON-kroppen `{ "lat": 59.299, "lon": 18.081 }` returnerar `{ stops: [{ id, name, distance }] }`, de närmaste hållplatserna inom 1,5 km (ResRobot Nearby stops). Positionen skickas i kroppen och inte i adressen, så att den inte hamnar i loggar. Den avrundas till tre decimaler (cirka 100 m) och sparas inte.

`GET /api/trafik?action=departures&stopId=<id>&stopName=<namn>&mode=all&direction=departures|arrivals` returnerar `{ departures: [...] }`.

## Miljövariabler

Sätts i Cloudflare Pages under *Settings → Environment variables* (lägg dem aldrig i koden, repot är publikt).

| Variabel | Krävs | Beskrivning |
| --- | --- | --- |
| `TRAFIKLAB_REALTIME_API_KEY` | Ja* | Nyckel till Trafiklab Realtime APIs. Förstahandskälla för tavlor och hållplatssök |
| `TRAFIKLAB_RESROBOT_KEY` | Ja* | Nyckel till ResRobot v2.1. Används som reserv om Realtime-nyckeln saknas eller API:et inte svarar |
| `TRAFIKLAB_API_KEY` / `TRAFIKLAB_REALTIME_KEY` | | Äldre namn för ResRobot-nyckeln, läses om `TRAFIKLAB_RESROBOT_KEY` saknas |
| `TRAFIKVERKET_API_KEY` | Nej | Realtid, spår, inställda tåg och avvikelser för all tågtrafik från Trafikverket |
| `VASTTRAFIK_KEY` / `VASTTRAFIK_SECRET` | Nej | Klientidentifierare och hemlighet för Västtrafiks Planera Resa v4. Ger realtid för Västtrafiks bussar, spårvagnar och båtar |

\* Minst en av Trafiklab-nycklarna måste finnas.

### Varifrån förseningarna kommer

- **Tåg:** Trafikverket (matchas på tågnummer, station och ordinarie tid). Saknas matchning används Trafiklab.
- **Buss, T-bana, spårvagn, båt:** Trafiklab Realtime APIs. Realtid finns bara för de operatörer som levererar det till Trafiklab (t.ex. SL, Skånetrafiken, UL, Östgötatrafiken). Västtrafik har bara tidtabell där, så deras realtid hämtas direkt från Västtrafiks Planera Resa v4 (matchas på linje och ordinarie tid). För SL fylls saknad realtid i från [SL Transport API](https://www.trafiklab.se/api/trafiklab-apis/sl/transport/) (ingen nyckel): Trafiklab-hållplatsen översätts till närmaste SL-site och avgångarna matchas på linje och ordinarie tid. Bara avgångar, inte ankomster.
- Avgångar utan realtidsdata visas som **"Enligt tidtabell"** i stället för "I tid".
- Tavlan uppdateras automatiskt varje minut medan fliken är öppen. Svaren cachas i Cloudflare i 45 sekunder så att kvoten räcker.

## Kör lokalt

```bash
npm install
npm run dev        # bara frontend, http://localhost:3000
```

`npm run dev` startar inte API-funktionen. För att köra frontend och API tillsammans:

```bash
npm run build
printf 'TRAFIKLAB_REALTIME_API_KEY=din-nyckel\nTRAFIKVERKET_API_KEY=din-nyckel\n' > .dev.vars
npx wrangler pages dev out
```

## Driftsättning (Cloudflare Pages)

- **Build command:** `npm run build`
- **Build output directory:** `out`
- Mappen `functions/` plockas upp automatiskt av Cloudflare Pages.

## Kontakt

kontakt@alltiditid.se
