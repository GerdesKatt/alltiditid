export type TransportMode = 'all' | 'subway' | 'commuter' | 'tram' | 'bus' | 'train' | 'ferry';
export type RegionKey = 'all' | 'stockholm' | 'goteborg' | 'skane';
export type BoardDirection = 'departures' | 'arrivals';
export type RiderMood = 'on-time' | 'slightly-late' | 'delayed';
export type InfoTab = 'about' | 'privacy' | 'terms' | 'contact';

export type Departure = {
  id: string;
  line: string;
  trainNumber?: string;
  /** Turens id och startdatum hos Trafiklab, för hela resan (buss, T-bana, spårvagn, båt). */
  tripId?: string;
  tripDate?: string;
  /** Tåget borde ha gått men har inte gått enligt Trafikverket: står kvar. */
  pending?: boolean;
  operator: string;
  destination: string;
  scheduledTime: string;
  newTime?: string;
  estimatedTime: string;
  delayMinutes?: number;
  /** Minuter före tidtabell, när avgången eller ankomsten väntas gå tidigt. */
  earlyMinutes?: number;
  status: 'on-time' | 'delayed' | 'cancelled';
  /** Förväntad tid i svensk lokal tid, 'YYYY-MM-DDTHH:MM' (ny tid om försenad). */
  expectedAt?: string;
  /** Sätts i appen när en vald resa inte längre finns på tavlan. */
  gone?: boolean;
  /** false när källan saknar realtidsdata för avgången (bara tidtabell). */
  hasRealtime?: boolean;
  track?: string;
  /** Delhållplats i en sammanslagen tavla, t.ex. "Drottningtorget" under Göteborg C. */
  stopLabel?: string;
  deviation?: string;
  viaStops?: string[];
  directionType?: BoardDirection;
  transportMode?: TransportMode | 'other';
};

export type StopOption = {
  id: string;
  name: string;
  shortName?: string;
  /** Ort i sökförslag, t.ex. "Karlstad". */
  place?: string;
  /** Trafikslag i sökförslag, t.ex. ["Tåg", "Buss"]. */
  modes?: string[];
};

export type Region = {
  key: RegionKey;
  label: string;
  stations: StopOption[];
  modes: { key: TransportMode; label: string }[];
};

/** En störning som gäller flera avgångar, visad en gång överst på tavlan. */
export type Disruption = {
  text: string;
  lines: string[];
};

export type BoardSource = 'trafiklab-realtime' | 'resrobot' | '';

/** Ett flyg från Swedavia (functions/api/trafik.js, action=flights). */
export type Flight = {
  id: string;
  flightId: string;
  airline?: string;
  airlineIata?: string;
  /** Destination vid avgångar, avreseort vid ankomster. */
  place?: string;
  /** IATA-koden för `place`, t.ex. "CPH". */
  placeIata?: string;
  /** Engelska namnet när det skiljer sig från det svenska. */
  placeEn?: string;
  via?: string[];
  viaIata?: string[];
  scheduledAt: string;
  scheduledTime: string;
  expectedAt: string;
  status: 'on-time' | 'delayed' | 'cancelled';
  delayMinutes?: number;
  newTime?: string;
  /** Har lyft eller landat. */
  done?: boolean;
  statusText?: string;
  terminal?: string;
  gate?: string;
  gateText?: string;
  checkIn?: string;
  codeshare?: string[];
  remarks?: string[];
  domestic?: boolean;
};

/** Kötid i en säkerhetskontroll (action=waittimes). */
export type SecurityQueue = {
  name: string;
  terminal?: string;
  minutes: number;
  fastTrack?: boolean;
  at?: string;
};
