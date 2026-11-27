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
  // Vid gaten när boardingen börjar: gå den längre gångtiden, plus väntetiden i säkerheten.
  const atSecurityBefore = boardingBefore + walkMax + (queue ?? 0);
  return {
    boarding: clockMinus(base, boardingBefore),
    gateCloses: clockMinus(base, closeBefore),
    walkMin,
    walkMax,
    queue,
    atSecurity: clockMinus(base, atSecurityBefore),
    atSecurityBefore,
  };
}
