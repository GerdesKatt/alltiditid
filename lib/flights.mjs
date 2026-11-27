// Flyg från Swedavia (FlightInfo v2 och WaitTime). Rena funktioner som gör om
// Swedavias svar till alltiditids format, så att de går att testa utan nät
// (test/flights.test.mjs). Hämtningen och cachningen finns i functions/api/trafik.js.
//
// Swedavias svar är dokumenterade med PascalCase ("FlightId"), men API:er av den här
// sorten svarar ibland i camelCase. pick() läser båda.

/** Swedavias tio flygplatser, i den ordning de visas, och sedan grannländernas. */
export const AIRPORTS = [
  { iata: 'ARN', name: 'Stockholm Arlanda', short: 'Arlanda', waitTimes: true },
  { iata: 'GOT', name: 'Göteborg Landvetter', short: 'Landvetter', waitTimes: true },
  { iata: 'BMA', name: 'Stockholm Bromma', short: 'Bromma', waitTimes: true },
  { iata: 'MMX', name: 'Malmö Airport', short: 'Malmö', waitTimes: false },
  { iata: 'LLA', name: 'Luleå Airport', short: 'Luleå', waitTimes: false },
  { iata: 'UME', name: 'Umeå Airport', short: 'Umeå', waitTimes: false },
  { iata: 'OSD', name: 'Åre Östersund Airport', short: 'Östersund', waitTimes: false },
  { iata: 'VBY', name: 'Visby Airport', short: 'Visby', waitTimes: false },
  { iata: 'KRN', name: 'Kiruna Airport', short: 'Kiruna', waitTimes: false },
  { iata: 'RNB', name: 'Ronneby Airport', short: 'Ronneby', waitTimes: false },
  // Utanför Swedavia: Avinors öppna flöde (lib/avinor.mjs).
  { iata: 'OSL', name: 'Oslo Gardermoen', short: 'Oslo', waitTimes: false, source: 'avinor' },
];

export function airportByIata(code) {
  const c = String(code || '').toUpperCase();
  return AIRPORTS.find((a) => a.iata === c) || null;
}

export function pick(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  const camel = key.charAt(0).toLowerCase() + key.slice(1);
  if (camel in obj) return obj[camel];
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lower) return obj[k];
  return undefined;
}

const pad = (n) => String(n).padStart(2, '0');

/** UTC-tid från Swedavia ("2026-11-26T13:05:00Z" eller utan Z) → svensk tid 'YYYY-MM-DDTHH:MM'. */
export function utcToLocal(utc) {
  if (!utc) return '';
  const s = String(utc);
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  if (Number.isNaN(ms)) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value])
  );
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

function localMs(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}

/** Datumen (UTC, 'YYYY-MM-DD') som behöver hämtas för att täcka de närmaste timmarna. */
export function datesToFetch(nowMs) {
  const d = new Date(nowMs);
  const today = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  // Sent på kvällen behövs också morgondagen, så att flyg efter midnatt syns.
  if (d.getUTCHours() >= 21) {
    const t = new Date(nowMs + 24 * 3600 * 1000);
    return [today, `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`];
  }
  return [today];
}

/** Försening räknas från 5 minuter, som på flygplatsernas egna tavlor ungefär. */
const DELAY_THRESHOLD_MIN = 5;

const DONE_STATUS = new Set(['LAN']);
const CANCELLED_STATUS = new Set(['CAN', 'DEL']);

/**
 * Ett flyg i alltiditids format. `direction` är 'departures' eller 'arrivals'.
 * Returnerar null för poster som saknar flightnummer eller tid.
 */
export function normalizeFlight(f, direction) {
  const flightId = String(pick(f, 'FlightId') || '').trim();
  const times = pick(f, direction === 'arrivals' ? 'ArrivalTime' : 'DepartureTime') || {};
  const scheduledAt = utcToLocal(pick(times, 'ScheduledUtc'));
  if (!flightId || !scheduledAt) return null;
  const estimatedAt = utcToLocal(pick(times, 'EstimatedUtc'));
  const actualAt = utcToLocal(pick(times, 'ActualUtc'));
  const las = pick(f, 'LocationAndStatus') || {};
  const legStatus = String(pick(las, 'FlightLegStatus') || '').toUpperCase();
  const airline = pick(f, 'AirlineOperator') || {};
  const side = direction === 'arrivals' ? 'DepartureAirport' : 'ArrivalAirport';
  const otherSv = String(pick(f, `${side}Swedish`) || '').trim();
  const otherEn = String(pick(f, `${side}English`) || '').trim();
  const other = otherSv || otherEn;
  const placeIata = String(pick(f, `${side}Iata`) || '').trim().toUpperCase();
  const viaList = pick(f, 'ViaDestinations') || [];
  const via = viaList.map((v) => pick(v, 'AirportSwedish') || pick(v, 'AirportEnglish')).filter(Boolean);
  const viaIata = viaList
    .map((v) => String(pick(v, 'AirportIata') || '').trim().toUpperCase())
    .filter(Boolean);
  const remarks = (pick(f, 'RemarksSwedish') || [])
    .map((r) => String(pick(r, 'Text') || '').trim())
    .filter(Boolean);
  const checkIn = pick(f, 'CheckIn') || {};
  const deskFrom = pick(checkIn, 'CheckInDeskFrom');
  const deskTo = pick(checkIn, 'CheckInDeskTo');

  const statusSv = String(pick(las, 'FlightLegStatusSwedish') || '').trim();
  // Ibland finns ny tid bara i statustexten: "Beräknad 11:40" eller "Ny tid 11:40".
  let textEstimate = '';
  const m = /(?:beräknad|ny tid)\s+(\d{1,2})[:.](\d{2})/i.exec(statusSv);
  if (m && !estimatedAt) {
    const hhmm = `${m[1].padStart(2, '0')}:${m[2]}`;
    let day = scheduledAt.slice(0, 10);
    // Ny tid efter midnatt hör till nästa dag.
    if (hhmm < scheduledAt.slice(11, 16) && scheduledAt.slice(11, 13) >= '20') {
      const d = new Date(`${day}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      day = d.toISOString().slice(0, 10);
    }
    textEstimate = `${day}T${hhmm}`;
  }
  const expectedAt = actualAt || estimatedAt || textEstimate || scheduledAt;
  const delta = Math.round((localMs(expectedAt) - localMs(scheduledAt)) / 60000);
  const cancelled = CANCELLED_STATUS.has(legStatus);
  const delayed = !cancelled && delta >= DELAY_THRESHOLD_MIN;

  const out = {
    id: `${flightId}|${scheduledAt}`,
    flightId,
    airline: String(pick(airline, 'Name') || '').trim(),
    airlineIata: String(pick(airline, 'IATA') || '').trim(),
    place: other,
    // För filtret: koden och det engelska namnet ("CPH", "Copenhagen").
    placeIata,
    placeEn: otherEn && otherEn !== other ? otherEn : '',
    via,
    viaIata,
    scheduledAt,
    scheduledTime: scheduledAt.slice(11, 16),
    expectedAt: cancelled ? scheduledAt : expectedAt,
    status: cancelled ? 'cancelled' : delayed ? 'delayed' : 'on-time',
    delayMinutes: delayed ? delta : 0,
    newTime: delayed ? expectedAt.slice(11, 16) : '',
    done: Boolean(actualAt) || DONE_STATUS.has(legStatus),
    statusText: statusSv,
    // "T5" → "5", så att det blir "Terminal 5".
    terminal: String(pick(las, 'Terminal') || '').trim().replace(/^T(?=\w)/i, ''),
    gate: String(pick(las, 'Gate') || '').trim(),
    gateText: String(pick(las, 'GateActionSwedish') || '').trim(),
    checkIn:
      deskFrom && deskTo && deskFrom !== deskTo ? `${deskFrom}–${deskTo}` : deskFrom ? String(deskFrom) : '',
    codeshare: (pick(f, 'CodeShareData') || []).map(String).filter((c) => c && c !== flightId),
    remarks,
    domestic: String(pick(f, 'DIIndicator') || '').toUpperCase() === 'D',
  };
  // Tomma fält tas bort, som för avgångarna.
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v === '' || v === false || (Array.isArray(v) && v.length === 0)) delete out[k];
  }
  if (out.delayMinutes === 0) delete out.delayMinutes;
  return out;
}

/**
 * Flygen från ett eller flera svar (ett per datum), sorterade på väntad tid, utan
 * dubbletter och utan dem som gått för mer än `graceMin` minuter sedan.
 */
export function flightBoard(responses, direction, nowLocal, graceMin = 15) {
  const now = localMs(nowLocal);
  const seen = new Set();
  const list = [];
  for (const body of responses) {
    for (const raw of pick(body, 'Flights') || []) {
      const f = normalizeFlight(raw, direction);
      if (!f || seen.has(f.id)) continue;
      seen.add(f.id);
      const t = localMs(f.expectedAt);
      if (!Number.isNaN(now) && t < now - graceMin * 60000) continue;
      list.push(f);
    }
  }
  list.sort((a, b) => a.expectedAt.localeCompare(b.expectedAt) || a.flightId.localeCompare(b.flightId));
  return list;
}

/** Kötiderna i säkerhetskontrollen, kortade och sorterade per terminal. */
export function waitTimes(body) {
  const list = Array.isArray(body) ? body : pick(body, 'WaitTimes') || pick(body, 'Queues') || [];
  return list
    .map((q) => ({
      name: String(pick(q, 'QueueName') || '')
        .replace(/^Security\s+/i, '')
        .replace(/\s*FastTrack$/i, '')
        .trim(),
      terminal: String(pick(q, 'Terminal') || '').trim().replace(/^T(?=\w)/i, ''),
      minutes: Number(pick(q, 'CurrentProjectedWaitTime')),
      fastTrack: Boolean(pick(q, 'IsFastTrack')),
      at: utcToLocal(pick(q, 'CurrentTime')),
    }))
    .filter((q) => q.name && Number.isFinite(q.minutes) && q.minutes >= 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'sv') || Number(a.fastTrack) - Number(b.fastTrack));
}

// Flygplatser som folk ofta söker på med flygplatsens eget namn eller en annan
// stavning än Swedavias. Swedavia ger svenskt och engelskt ortnamn och IATA-kod,
// men inte "Kastrup" eller "Gardermoen". Nyckeln är IATA-koden.
const AIRPORT_ALIASES = {
  CPH: ['Köpenhamn', 'Copenhagen', 'Kastrup'],
  OSL: ['Oslo', 'Gardermoen'],
  TRF: ['Torp', 'Sandefjord'],
  HEL: ['Helsingfors', 'Helsinki', 'Vantaa'],
  KEF: ['Reykjavik', 'Keflavik'],
  LHR: ['London', 'Heathrow'],
  LGW: ['London', 'Gatwick'],
  STN: ['London', 'Stansted'],
  LTN: ['London', 'Luton'],
  LCY: ['London', 'London City'],
  CDG: ['Paris', 'Charles de Gaulle', 'Roissy'],
  ORY: ['Paris', 'Orly'],
  BVA: ['Paris', 'Beauvais'],
  AMS: ['Amsterdam', 'Schiphol'],
  BRU: ['Bryssel', 'Brussels', 'Zaventem'],
  CRL: ['Bryssel', 'Brussels', 'Charleroi'],
  FRA: ['Frankfurt'],
  MUC: ['München', 'Munich', 'Franz Josef Strauss'],
  BER: ['Berlin', 'Brandenburg'],
  HAM: ['Hamburg'],
  DUS: ['Düsseldorf'],
  ZRH: ['Zürich', 'Zurich', 'Kloten'],
  GVA: ['Genève', 'Geneva', 'Cointrin'],
  VIE: ['Wien', 'Vienna', 'Schwechat'],
  WAW: ['Warszawa', 'Warsaw', 'Chopin'],
  GDN: ['Gdansk', 'Lech Walesa'],
  KRK: ['Krakow', 'Balice'],
  PRG: ['Prag', 'Prague', 'Vaclav Havel'],
  BUD: ['Budapest', 'Ferenc Liszt'],
  RIX: ['Riga'],
  TLL: ['Tallinn'],
  VNO: ['Vilnius'],
  DUB: ['Dublin'],
  EDI: ['Edinburgh'],
  MAN: ['Manchester'],
  FCO: ['Rom', 'Rome', 'Fiumicino', 'Leonardo da Vinci'],
  CIA: ['Rom', 'Rome', 'Ciampino'],
  MXP: ['Milano', 'Milan', 'Malpensa'],
  LIN: ['Milano', 'Milan', 'Linate'],
  BGY: ['Milano', 'Milan', 'Bergamo', 'Orio al Serio'],
  VCE: ['Venedig', 'Venice', 'Marco Polo'],
  NCE: ['Nice', 'Nizza', "Côte d'Azur"],
  MAD: ['Madrid', 'Barajas'],
  BCN: ['Barcelona', 'El Prat'],
  AGP: ['Malaga', 'Málaga', 'Costa del Sol'],
  ALC: ['Alicante'],
  PMI: ['Palma', 'Mallorca', 'Son Sant Joan'],
  LPA: ['Las Palmas', 'Gran Canaria'],
  TFS: ['Teneriffa', 'Tenerife', 'Tenerife Sur'],
  LIS: ['Lissabon', 'Lisbon', 'Humberto Delgado'],
  ATH: ['Aten', 'Athens', 'Eleftherios Venizelos'],
  IST: ['Istanbul'],
  SAW: ['Istanbul', 'Sabiha Gökçen'],
  DXB: ['Dubai'],
  DOH: ['Doha', 'Hamad'],
  JFK: ['New York', 'John F Kennedy', 'Kennedy'],
  EWR: ['New York', 'Newark'],
  BKK: ['Bangkok', 'Suvarnabhumi'],
  ARN: ['Stockholm', 'Arlanda'],
  BMA: ['Stockholm', 'Bromma'],
  NYO: ['Stockholm', 'Skavsta', 'Nyköping'],
  VST: ['Stockholm', 'Västerås'],
  GOT: ['Göteborg', 'Gothenburg', 'Landvetter'],
  MMX: ['Malmö', 'Malmo', 'Sturup'],
  LLA: ['Luleå', 'Kallax'],
  UME: ['Umeå'],
  OSD: ['Östersund', 'Åre', 'Frösön'],
  VBY: ['Visby', 'Gotland'],
  KRN: ['Kiruna'],
  RNB: ['Ronneby', 'Blekinge'],
};

/** Gemener utan mellanslag, bindestreck eller accenter: "Köpenhamn" → "kopenhamn". */
export function foldSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/[\s\-'.]+/g, '');
}

const ALIAS_BY_NAME = new Map();
for (const [code, names] of Object.entries(AIRPORT_ALIASES)) {
  for (const n of names) {
    const k = foldSearch(n);
    if (!ALIAS_BY_NAME.has(k)) ALIAS_BY_NAME.set(k, new Set());
    ALIAS_BY_NAME.get(k).add(code);
  }
}

/** Koder för en ort när svaret saknar IATA (äldre cachade svar): "Köpenhamn" → CPH. */
function codesForName(name) {
  return ALIAS_BY_NAME.get(foldSearch(name)) || new Set();
}

/**
 * Om ett flyg matchar det som skrivits i filtret: flightnummer, codeshare, flygbolag,
 * ortnamnet på svenska och engelska, IATA-koden och vanliga flygplatsnamn
 * ("CPH", "Copenhagen", "Kastrup" hittar alla Köpenhamn).
 */
export function flightMatches(f, query) {
  const q = foldSearch(query);
  if (!q) return true;
  const places = [f.place, f.placeEn, ...(f.via || [])].filter(Boolean);
  const codes = new Set([f.placeIata, ...(f.viaIata || [])].filter(Boolean));
  // Kända orter utan kod i svaret får koden från tabellen. Är orten tvetydig
  // ("London") får den alla, så att "Heathrow" inte missar.
  if (!f.placeIata) for (const c of codesForName(f.place)) codes.add(c);
  const hay = [f.flightId, ...(f.codeshare || []), f.airline, f.airlineIata, ...places];
  for (const c of codes) hay.push(c, ...(AIRPORT_ALIASES[c] || []));
  return hay.some((s) => s && foldSearch(s).includes(q));
}
