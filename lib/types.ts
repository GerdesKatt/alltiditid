export type TransportMode = 'all' | 'subway' | 'commuter' | 'tram' | 'bus' | 'train' | 'ferry';
export type RegionKey = 'all' | 'stockholm' | 'goteborg' | 'skane';
export type BoardDirection = 'departures' | 'arrivals';
export type RiderMood = 'on-time' | 'slightly-late' | 'delayed';
export type InfoTab = 'about' | 'privacy' | 'terms' | 'contact';

export type Departure = {
  id: string;
  line: string;
  trainNumber?: string;
  operator: string;
  destination: string;
  scheduledTime: string;
  newTime?: string;
  estimatedTime: string;
  delayMinutes?: number;
  status: 'on-time' | 'delayed' | 'cancelled';
  /** Förväntad tid i svensk lokal tid, 'YYYY-MM-DDTHH:MM' (ny tid om försenad). */
  expectedAt?: string;
  /** Sätts i appen när en vald resa inte längre finns på tavlan. */
  gone?: boolean;
  /** false när källan saknar realtidsdata för avgången (bara tidtabell). */
  hasRealtime?: boolean;
  track: string;
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
};

export type Region = {
  key: RegionKey;
  label: string;
  stations: StopOption[];
  modes: { key: TransportMode; label: string }[];
};

export type BoardSource = 'trafiklab-realtime' | 'resrobot' | '';
