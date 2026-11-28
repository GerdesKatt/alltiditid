// "Hinna till gaten": uppskattad boarding, när gaten stänger, gångtid från
// säkerhetskontrollen och när man senast bör vara vid säkerhetskontrollen.
//
// Swedavias öppna FlightInfo ger ingen boardingtid och inga gångtider (bara
// gate-status när det händer). Allt här är därför uppskattningar som appen visar
// med "ca". Flygbolagens regler: när gaten stänger före avgång, och boarding börjar
// ungefär en kvart före det. Lågprisbolagen stänger tidigare. Hellre för tidigt än sent.

/** Minuter före avgång: [boarding börjar, gaten stänger]. */
const DEFAULT_INTL = [35, 20];
const DEFAULT_DOMESTIC = [25, 15];
const AIRLINE_RULES = {
  FR: [45, 30], // Ryanair
  RK: [45, 30], // Ryanair UK
  W6: [45, 30], // Wizz Air
  W4: [45, 30],
  U2: [45, 30], // easyJet
  EC: [45, 30],
};

/** Gångtid i minuter [kortast, längst] från säkerhetskontrollen till gaterna. */
const WALK = {
  'ARN|5': [5, 15],
  'ARN|2': [3, 8],
  'ARN|4': [3, 8],
  ARN: [5, 15],
  GOT: [3, 10],
  BMA: [2, 5],
  MMX: [2, 6],
  OSL: [5, 15],
};
const WALK_DEFAULT = [2, 8];

const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DDTHH:MM" minus ett antal minuter, som klocktid "HH:MM". */
export function clockMinus(localIso, minutes) {
  const m = /T(\d{2}):(\d{2})/.exec(String(localIso || ''));
  if (!m) return '';
  let total = Number(m[1]) * 60 + Number(m[2]) - minutes;
  total = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** "YYYY-MM-DDTHH:MM" minus ett antal minuter, som hel lokal tid (datumet följer med över midnatt). */
export function localMinus(localIso, minutes) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(localIso || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - minutes * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Swedavia säger att gaten är stängd ("Gate stängd", "Utgång stängd", "Gate closed"). */
export function gateClosedByAirport(flight) {
  const texts = [flight && flight.gateText, ...((flight && flight.remarks) || [])];
  return texts.some((t) => /\b(stängd|closed)\b/i.test(String(t || '')));
}

/**
 * Var resenären står i förhållande till planen, med klockan `nowLocal` ('YYYY-MM-DDTHH:MM').
 * 'ok': hinner till security i tid. 'late': security-tiden har passerat men gaten är öppen.
 * 'closed': gaten är stängd, enligt flygplatsen eller för att stängningstiden har passerat.
 * Utan detta visade kortet "Var vid security senast 11:43" klockan 12:48 (UX-revisionen, fynd 1).
 */
export function gateStage(flight, plan, nowLocal) {
  if (!plan) return 'ok';
  if (gateClosedByAirport(flight)) return 'closed';
  const now = String(nowLocal || '');
  if (!now) return 'ok';
  if (plan.gateClosesAt && now >= plan.gateClosesAt) return 'closed';
  if (plan.atSecurityAt && now > plan.atSecurityAt) return 'late';
  return 'ok';
}

/** Minuter före avgång då boarding börjar och gaten stänger. */
export function gateRules(airlineIata, domestic) {
  const rule = AIRLINE_RULES[String(airlineIata || '').toUpperCase()];
  if (rule) return { boardingBefore: rule[0], closeBefore: rule[1] };
  const [b, c] = domestic ? DEFAULT_DOMESTIC : DEFAULT_INTL;
  return { boardingBefore: b, closeBefore: c };
}

/** Ungefärlig gångtid från säkerhetskontrollen, [kortast, längst] i minuter. */
export function walkMinutes(airport, terminal) {
  const a = String(airport || '').toUpperCase();
  return WALK[`${a}|${String(terminal || '').toUpperCase()}`] || WALK[a] || WALK_DEFAULT;
}

/**
 * Plan för ett avgående flyg. `queueMinutes` är kötiden i säkerhetskontrollen
 * (null när den inte är känd). Tiderna räknas från väntad avgång, så att en
 * försening flyttar dem.
 */
export function gatePlan(flight, airport, queueMinutes = null) {
  if (!flight || flight.status === 'cancelled' || flight.done) return null;
  const base = flight.expectedAt || flight.scheduledAt;
  if (!base) return null;
  const { boardingBefore, closeBefore } = gateRules(flight.airlineIata, flight.domestic);
  const [walkMin, walkMax] = walkMinutes(airport, flight.terminal);
  const queue = Number.isFinite(queueMinutes) && queueMinutes >= 0 ? Math.round(queueMinutes) : null;
  // Vid gaten när boardingen börjar: gå den längre gångtiden, plus kötiden.
  const atSecurityBefore = boardingBefore + walkMax + (queue ?? 0);
  return {
    // Samma tider som hela 'YYYY-MM-DDTHH:MM', så att de kan jämföras med klockan (gateStage).
    atSecurityAt: localMinus(base, atSecurityBefore),
    gateClosesAt: localMinus(base, closeBefore),
    boarding: clockMinus(base, boardingBefore),
    gateCloses: clockMinus(base, closeBefore),
    walkMin,
    walkMax,
    queue,
    atSecurity: clockMinus(base, atSecurityBefore),
    atSecurityBefore,
  };
}

/** Terminalen i ett könamn: "Terminal 5F" → "5F". */
function terminalOf(q) {
  if (q.terminal) return String(q.terminal).toUpperCase();
  const m = /terminal\s*([0-9A-Z]+)/i.exec(String(q.name || ''));
  return m ? m[1].toUpperCase() : '';
}

/**
 * Vanliga köer (inte FastTrack) för flygets terminal. "5F" räknas som terminal 5.
 * Finns ingen kö för terminalen, eller är terminalen okänd, gäller alla köer.
 */
export function queuesForTerminal(queues, terminal) {
  const regular = (queues || []).filter((q) => !q.fastTrack);
  const t = String(terminal || '').toUpperCase();
  if (!t) return regular;
  const mine = regular.filter((q) => {
    const qt = terminalOf(q);
    return qt === t || (qt.startsWith(t) && !/\d/.test(qt.slice(t.length, t.length + 1)));
  });
  return mine.length ? mine : regular;
}

/** Kötiden nu för flygets terminal (den längsta om det finns flera), eller null. */
export function queueNowFor(queues, terminal) {
  const list = queuesForTerminal(queues, terminal).filter((q) => Number.isFinite(q.minutes));
  return list.length ? Math.max(...list.map((q) => q.minutes)) : null;
}

/**
 * Typisk kötid ("Brukar vara") för flygets terminal timmen innan avgång, eller null.
 * `forecast` är svaret från action=queueforecast för avgångsdagen.
 */
export function typicalQueueFor(forecast, flight) {
  const base = flight && (flight.expectedAt || flight.scheduledAt);
  if (!forecast || !Array.isArray(forecast.queues) || !base || forecast.date !== base.slice(0, 10)) return null;
  const hour = Math.max(0, Number(base.slice(11, 13)) - 1);
  const values = queuesForTerminal(forecast.queues, flight.terminal)
    .map((q) => (q.hours || []).find((c) => c.hour === hour))
    .map((c) => (c && Number.isFinite(c.typical) ? c.typical : null))
    .filter((v) => v !== null);
  return values.length ? Math.max(...values) : null;
}
