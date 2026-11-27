// Vilken sorts dag ett datum är, för prognosen över kötider i säkerhetskontrollen.
//
// En måndag är inte alltid en vanlig måndag: före en långhelg, under sportlovet och
// mitt i juli reser helt andra människor (och fler charterresenärer). Klasserna, i
// prioritetsordning:
//   helgdag  röda dagar och aftnar (julafton, midsommarafton, påskafton, nyårsafton)
//   resdag   vardagen före en helg med röd dag, och klämdagar
//   sommar   15 juni–15 augusti (semester och sommarlov)
//   lov      sportlov (v. 7–10), påsklov, höstlov (v. 44) och jullov, ungefärligt:
//            loven skiljer sig mellan kommunerna, så veckorna täcker hela landet
//   vanlig   allt annat
//
// Datum är 'YYYY-MM-DD' i svensk tid och räknas utan tidszoner (UTC-midnatt).

const DAY = 86400000;

const ms = (date) => Date.parse(`${date}T00:00:00Z`);
const iso = (t) => new Date(t).toISOString().slice(0, 10);

/** Påskdagen ett visst år (gregoriansk, "anonym" algoritm). */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Första dagen med veckodag `dow` (0 = söndag) från och med datumet. */
function firstWeekdayFrom(date, dow) {
  let t = ms(date);
  while (new Date(t).getUTCDay() !== dow) t += DAY;
  return iso(t);
}

const holidayCache = new Map();

/** Röda dagar och aftnar ett år, som karta datum → namn. */
export function swedishHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const e = ms(easterSunday(year));
  const rel = (n) => iso(e + n * DAY);
  const midsummerEve = iso(ms(firstWeekdayFrom(`${year}-06-19`, 5)));
  const map = new Map([
    [`${year}-01-01`, 'Nyårsdagen'],
    [`${year}-01-06`, 'Trettondedag jul'],
    [rel(-2), 'Långfredagen'],
    [rel(-1), 'Påskafton'],
    [rel(0), 'Påskdagen'],
    [rel(1), 'Annandag påsk'],
    [`${year}-05-01`, 'Första maj'],
    [rel(39), 'Kristi himmelsfärdsdag'],
    [rel(49), 'Pingstdagen'],
    [`${year}-06-06`, 'Nationaldagen'],
    [midsummerEve, 'Midsommarafton'],
    [iso(ms(midsummerEve) + DAY), 'Midsommardagen'],
    [firstWeekdayFrom(`${year}-10-31`, 6), 'Alla helgons dag'],
    [`${year}-12-24`, 'Julafton'],
    [`${year}-12-25`, 'Juldagen'],
    [`${year}-12-26`, 'Annandag jul'],
    [`${year}-12-31`, 'Nyårsafton'],
  ]);
  holidayCache.set(year, map);
  return map;
}

/** Namnet på helgdagen, eller null. */
export function holidayName(date) {
  return swedishHolidays(Number(date.slice(0, 4))).get(date) || null;
}

const weekday = (date) => new Date(ms(date)).getUTCDay();
const isWeekend = (date) => weekday(date) === 0 || weekday(date) === 6;
const shift = (date, n) => iso(ms(date) + n * DAY);
const isOff = (date) => isWeekend(date) || Boolean(holidayName(date));

/** ISO-veckonummer. */
export function isoWeek(date) {
  const t = new Date(ms(date));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / DAY + 1) / 7);
}

/** Ungefärliga skollov (inte sommaren, som är en egen klass). */
function isSchoolBreak(date) {
  const md = date.slice(5);
  if (md >= '12-20' || md <= '01-07') return true; // jullov
  const week = isoWeek(date);
  if (week >= 7 && week <= 10) return true; // sportlov, olika veckor i olika län
  if (week === 44) return true; // höstlov
  // Påsklov: veckan före påsk och veckan efter, eftersom kommunerna väljer olika.
  const easter = ms(easterSunday(Number(date.slice(0, 4))));
  const t = ms(date);
  return t >= easter - 7 * DAY && t <= easter + 7 * DAY;
}

/**
 * Dagens klass: 'helgdag', 'resdag', 'sommar', 'lov' eller 'vanlig'.
 */
export function dayClass(date) {
  if (holidayName(date)) return 'helgdag';
  if (!isWeekend(date)) {
    const nextHoliday = holidayName(shift(date, 1));
    // Vardagen före en röd dag (eller före en helg där måndagen är röd).
    if (nextHoliday) return 'resdag';
    if (weekday(date) === 5 && holidayName(shift(date, 3))) return 'resdag';
    // Klämdag: ledigt både dagen före och dagen efter, och minst en av dem är röd.
    if (isOff(shift(date, -1)) && isOff(shift(date, 1)) && (holidayName(shift(date, -1)) || holidayName(shift(date, 1)))) {
      return 'resdag';
    }
  }
  const md = date.slice(5);
  if (md >= '06-15' && md <= '08-15') return 'sommar';
  if (isSchoolBreak(date)) return 'lov';
  return 'vanlig';
}

/** Veckodag 0–6 (0 = söndag) för ett datum. */
export function dayOfWeek(date) {
  return weekday(date);
}
