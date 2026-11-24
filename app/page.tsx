'use client';

import React, { useEffect, useState } from 'react';

type TransportMode = 'all' | 'subway' | 'commuter' | 'tram' | 'bus' | 'train' | 'ferry';
type RegionKey = 'all' | 'stockholm' | 'goteborg' | 'skane';

type Departure = {
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
  track: string;
  deviation?: string;
  viaStops?: string[];
  directionType?: 'departures' | 'arrivals';
  transportMode?: TransportMode | 'other';
};

type StopOption = {
  id: string;
  name: string;
  shortName?: string;
};

type BoardDirection = 'departures' | 'arrivals';
type RiderMood = 'on-time' | 'slightly-late' | 'delayed';

const REGIONS: {
  key: RegionKey;
  label: string;
  stations: StopOption[];
  modes: { key: TransportMode; label: string }[];
}[] = [
  {
    key: 'all',
    label: 'Hela Sverige',
    stations: [
      { id: '740000001', name: 'Stockholm Centralstation', shortName: 'Stockholm C' },
      { id: '740020749', name: 'T-Centralen', shortName: 'T-Centralen' },
      { id: '740000002', name: 'Göteborg Centralstation', shortName: 'Göteborg C' },
      { id: '740000003', name: 'Malmö Centralstation', shortName: 'Malmö C' },
      { id: '740000120', name: 'Lund Centralstation', shortName: 'Lund C' },
      { id: '740000556', name: 'Stockholm Arlanda Airport', shortName: 'Arlanda' },
    ],
    modes: [
      { key: 'all', label: 'Alla' },
      { key: 'train', label: 'Tåg' },
      { key: 'commuter', label: 'Pendel' },
      { key: 'subway', label: 'T-bana' },
      { key: 'tram', label: 'Spårvagn' },
      { key: 'bus', label: 'Buss' },
    ],
  },
  {
    key: 'stockholm',
    label: 'Stockholm',
    stations: [
      { id: '740020749', name: 'T-Centralen', shortName: 'T-Centralen' },
      { id: '740000001', name: 'Stockholm Centralstation', shortName: 'Stockholm C' },
      { id: '740020751', name: 'Slussen', shortName: 'Slussen' },
      { id: '740020755', name: 'Odenplan', shortName: 'Odenplan' },
      { id: '740020754', name: 'Gullmarsplan', shortName: 'Gullmarsplan' },
    ],
    modes: [
      { key: 'all', label: 'Alla' },
      { key: 'subway', label: 'T-bana' },
      { key: 'commuter', label: 'Pendeltåg' },
      { key: 'bus', label: 'SL-buss' },
      { key: 'tram', label: 'Tvärbana/Lokal' },
      { key: 'train', label: 'Fjärr/Regional' },
    ],
  },
  {
    key: 'goteborg',
    label: 'Göteborg',
    stations: [
      { id: '740000002', name: 'Göteborg Centralstation', shortName: 'Göteborg C' },
      { id: '740025614', name: 'Brunnsparken', shortName: 'Brunnsparken' },
      { id: '740025624', name: 'Korsvägen', shortName: 'Korsvägen' },
      { id: '740025619', name: 'Järntorget', shortName: 'Järntorget' },
    ],
    modes: [
      { key: 'all', label: 'Alla' },
      { key: 'tram', label: 'Spårvagn' },
      { key: 'bus', label: 'Buss' },
      { key: 'commuter', label: 'Pendel/Tåg' },
      { key: 'ferry', label: 'Båt/Färja' },
      { key: 'train', label: 'Fjärrtåg' },
    ],
  },
  {
    key: 'skane',
    label: 'Skåne',
    stations: [
      { id: '740000003', name: 'Malmö Centralstation', shortName: 'Malmö C' },
      { id: '740000120', name: 'Lund Centralstation', shortName: 'Lund C' },
      { id: '740001581', name: 'Triangeln', shortName: 'Triangeln' },
      { id: '740000044', name: 'Helsingborg Centralstation', shortName: 'Helsingborg C' },
    ],
    modes: [
      { key: 'all', label: 'Alla' },
      { key: 'commuter', label: 'Pågatåg/Öresund' },
      { key: 'bus', label: 'Buss' },
      { key: 'train', label: 'Fjärrtåg' },
    ],
  },
];

export default function HomePage() {
  const [region, setRegion] = useState<RegionKey>('all');
  const [selectedStop, setSelectedStop] = useState<StopOption>(REGIONS[0].stations[0]);
  const [direction, setDirection] = useState<BoardDirection>('departures');
  const [mode, setMode] = useState<TransportMode>('all');
  const [stationQuery, setStationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StopOption[]>([]);
  const [searchingStops, setSearchingStops] = useState(false);

  const [filterText, setFilterText] = useState('');
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeInfoTab, setActiveInfoTab] = useState<'about' | 'privacy' | 'terms' | 'contact'>('about');

  const [onBoardTrip, setOnBoardTrip] = useState<Departure | null>(null);
  const [riderStatus, setRiderStatus] = useState<RiderMood>('on-time');
  const [riderNote, setRiderNote] = useState('');
  const [copiedMsg, setCopiedMsg] = useState(false);

  const currentRegionObj = REGIONS.find((r) => r.key === region) || REGIONS[0];

  function handleRegionChange(newRegion: RegionKey) {
    setRegion(newRegion);
    setMode('all');
    const regObj = REGIONS.find((r) => r.key === newRegion);
    if (regObj && regObj.stations.length > 0) {
      setSelectedStop(regObj.stations[0]);
    }
    setStationQuery('');
    setSuggestions([]);
  }

  useEffect(() => {
    const q = stationQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearchingStops(true);
      fetch(`/api/trafik?action=search&q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data) => {
          setSuggestions(data.stops || []);
          setSearchingStops(false);
        })
        .catch(() => {
          setSearchingStops(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [stationQuery]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg(null);

    fetch(
      `/api/trafik?action=departures&stopId=${encodeURIComponent(
        selectedStop.id
      )}&stopName=${encodeURIComponent(selectedStop.name)}&mode=all&direction=${direction}`
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Fel vid hämtning');
        return data;
      })
      .then((data) => {
        if (!active) return;
        const list: Departure[] = Array.isArray(data.departures) ? data.departures : [];
        setDepartures(list);
        setLoading(false);

        setOnBoardTrip((prev) => {
          if (!prev) return null;
          const match = list.find((item) => item.id === prev.id);
          return match || prev;
        });
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err.message || 'Kunde inte hämta trafikinformation just nu.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedStop, direction]);

  const queryLower = filterText.trim().toLowerCase();
  const filtered = departures.filter((d) => {
    if (mode !== 'all' && d.transportMode !== mode) {
      return false;
    }

    if (!queryLower) return true;
    const viaMatch = Array.isArray(d.viaStops)
      ? d.viaStops.some((stopName) => stopName.toLowerCase().includes(queryLower))
      : false;
    return (
      d.destination.toLowerCase().includes(queryLower) ||
      d.line.toLowerCase().includes(queryLower) ||
      (d.trainNumber ? d.trainNumber.toLowerCase().includes(queryLower) : false) ||
      d.operator.toLowerCase().includes(queryLower) ||
      (d.deviation ? d.deviation.toLowerCase().includes(queryLower) : false) ||
      viaMatch
    );
  });

  const hasDisruptions = filtered.some(
    (d) => d.status === 'delayed' || d.status === 'cancelled'
  );

  function handleSelectOnBoard(item: Departure) {
    setOnBoardTrip(item);
    if (item.status === 'on-time') {
      setRiderStatus('on-time');
    } else if (item.status === 'delayed') {
      setRiderStatus('slightly-late');
    } else {
      setRiderStatus('delayed');
    }
    setCopiedMsg(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function buildShareMessage(trip: Departure): string {
    const effectiveNewTime =
      trip.status === 'delayed' ? trip.newTime || trip.estimatedTime || '' : '';
    const delayLabel =
      trip.status === 'delayed' && trip.delayMinutes && trip.delayMinutes > 0
        ? ` (+${trip.delayMinutes} min)`
        : '';

    const statusText =
      riderStatus === 'on-time'
        ? 'är i tid'
        : riderStatus === 'slightly-late'
        ? `är lite sen${delayLabel}`
        : `är försenad${delayLabel}`;

    const isArrival = trip.directionType === 'arrivals';
    const timeLabel = isArrival ? 'ankomst' : 'avgång';
    const timePart = effectiveNewTime
      ? `ord. ${timeLabel} ${trip.scheduledTime}, ny tid ${effectiveNewTime}${delayLabel}`
      : `${timeLabel} ${trip.scheduledTime}`;

    const routePart = isArrival
      ? `till ${selectedStop.name} (från ${trip.destination})`
      : `från ${selectedStop.name} mot ${trip.destination}`;

    const notePart = riderNote.trim() ? ` (${riderNote.trim()})` : '';

    return `Jag sitter på (${trip.operator} ${trip.line}) ${routePart} (${timePart}) – ${statusText}${notePart}.`;
  }

  async function handleShareTrip(trip: Departure) {
    const text = buildShareMessage(trip);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `Resestatus: ${selectedStop.name}`,
          text,
          url: 'https://alltiditid.se',
        });
        return;
      }
    } catch {
      // Fallback till urklipp
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 3000);
    }
  }

  return (
    <div id="alltiditid-app" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <header
        id="sidhuvud"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          marginBottom: '16px',
          borderRadius: '16px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <a
          href="#alltiditid-app"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            textDecoration: 'none',
          }}
        >
          <span
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '11px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0f172a 100%)',
              border: '1px solid rgba(56, 189, 248, 0.45)',
              boxShadow: '0 6px 18px rgba(2, 132, 199, 0.28)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="8.5" stroke="#38bdf8" strokeWidth="2.2" />
              <path
                d="M12 7.5V12L15.2 14.2"
                stroke="#f8fafc"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="18.5" cy="6" r="2.5" fill="#10b981" />
            </svg>
          </span>

          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '20px',
                fontWeight: 900,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: '#f8fafc',
              }}
            >
              alltid<span style={{ color: '#38bdf8' }}>itid</span>
              <span style={{ color: '#64748b', fontWeight: 700, fontSize: '15px' }}>.se</span>
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: '#94a3b8',
                marginTop: '2px',
              }}
            >
              Avgångar och ankomster i realtid
            </span>
          </span>
        </a>

        <nav style={{ display: 'flex', gap: '16px', fontSize: '13px', fontWeight: 600 }}>
          <a href="#avgangstavla" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
            Tidtabell
          </a>
          <a href="#om-tjansten" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
            Om tjänsten
          </a>
          <a
            href="#sidfot"
            onClick={() => setActiveInfoTab('contact')}
            style={{ color: '#38bdf8', textDecoration: 'none' }}
          >
            Kontakt
          </a>
        </nav>
      </header>

      {onBoardTrip ? (
        <section
          id="resenar-lage"
          style={{
            marginBottom: '18px',
            padding: '18px',
            borderRadius: '18px',
            background:
              'linear-gradient(135deg, rgba(2, 132, 199, 0.22) 0%, rgba(15, 23, 42, 0.96) 100%)',
            border: '1px solid #38bdf8',
            boxShadow: '0 12px 28px rgba(2, 132, 199, 0.18)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
              marginBottom: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#7dd3fc',
                }}
              >
                Jag är ombord
              </span>
              <h2
                style={{
                  fontSize: '19px',
                  fontWeight: 800,
                  margin: '4px 0 0 0',
                  color: '#f8fafc',
                }}
              >
                {onBoardTrip.directionType === 'arrivals'
                  ? `Ankomst ${selectedStop.name}`
                  : onBoardTrip.destination}{' '}
                (Ord. {onBoardTrip.scheduledTime}
                {onBoardTrip.status === 'delayed' && (onBoardTrip.newTime || onBoardTrip.estimatedTime)
                  ? ` • Ny tid ${onBoardTrip.newTime || onBoardTrip.estimatedTime}${
                      onBoardTrip.delayMinutes ? ` (+${onBoardTrip.delayMinutes} min)` : ''
                    }`
                  : ''}
                )
              </h2>
              <div style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '2px' }}>
                {onBoardTrip.directionType === 'arrivals'
                  ? `Från ${onBoardTrip.destination}`
                  : `Från ${selectedStop.name}`}{' '}
                | {onBoardTrip.line} | {onBoardTrip.operator}
                {onBoardTrip.track ? ` | ${onBoardTrip.track}` : ''}
                {onBoardTrip.deviation ? ` | ${onBoardTrip.deviation}` : ''}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setOnBoardTrip(null);
                setRiderNote('');
                setCopiedMsg(false);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #475569',
                backgroundColor: '#0f172a',
                color: '#cbd5e1',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Avsluta läge
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {[
              { key: 'on-time', label: 'Jag är i tid' },
              { key: 'slightly-late', label: 'Lite sen' },
              { key: 'delayed', label: 'Försenad' },
            ].map((opt) => {
              const active = riderStatus === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRiderStatus(opt.key as RiderMood)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: active ? '1px solid #38bdf8' : '1px solid #334155',
                    backgroundColor: active ? '#0284c7' : '#0f172a',
                    color: '#f8fafc',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={riderNote}
            onChange={(e) => setRiderNote(e.target.value)}
            placeholder="Valfri notis till den som hämtar (t.ex. Sitter i främre vagnen)..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #334155',
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              fontSize: '13px',
              marginBottom: '12px',
            }}
          />

          <div
            style={{
              padding: '11px 14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid #1e293b',
              fontSize: '13px',
              color: '#e2e8f0',
              marginBottom: '12px',
              lineHeight: 1.5,
            }}
          >
            <strong
              style={{
                color: '#94a3b8',
                display: 'block',
                fontSize: '11px',
                marginBottom: '4px',
              }}
            >
              Färdigt statusmeddelande:
            </strong>
            {buildShareMessage(onBoardTrip)}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleShareTrip(onBoardTrip)}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#10b981',
                color: '#062e22',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Skicka / kopiera status till den som hämtar
            </button>

            {copiedMsg ? (
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#6ee7b7' }}>
                Meddelandet är kopierat!
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      <section
        id="sok-och-filter"
        style={{
          marginBottom: '20px',
          padding: '18px 20px',
          borderRadius: '18px',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid #334155',
          boxShadow: '0 14px 35px rgba(2, 6, 23, 0.45)',
        }}
      >
        <h1
          style={{
            fontSize: '26px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            margin: '0 0 4px 0',
            color: '#f8fafc',
          }}
        >
          Koll på resan i realtid
        </h1>
        <p style={{ color: '#94a3b8', margin: '0 0 14px 0', fontSize: '14px', lineHeight: 1.45 }}>
          Välj stad eller sök hållplats för T-bana, spårvagn, pendel, tåg och buss i realtid.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          {REGIONS.map((reg) => {
            const active = region === reg.key;
            return (
              <button
                key={reg.key}
                type="button"
                onClick={() => handleRegionChange(reg.key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9px',
                  border: active ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: active ? 'rgba(56, 189, 248, 0.2)' : '#0f172a',
                  color: active ? '#7dd3fc' : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {reg.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '12px' }}>
          {currentRegionObj.stations.map((stop) => {
            const active = selectedStop.id === stop.id;
            return (
              <button
                key={stop.id}
                type="button"
                onClick={() => {
                  setSelectedStop(stop);
                  setStationQuery('');
                  setSuggestions([]);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '999px',
                  border: active ? '1px solid #10b981' : '1px solid #334155',
                  backgroundColor: active ? 'rgba(16, 185, 129, 0.18)' : 'rgba(15, 23, 42, 0.7)',
                  color: active ? '#6ee7b7' : '#cbd5e1',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {stop.shortName || stop.name}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setDirection('departures')}
              style={{
                padding: '7px 14px',
                borderRadius: '9px',
                border: direction === 'departures' ? '1px solid #38bdf8' : '1px solid #334155',
                backgroundColor: direction === 'departures' ? '#0369a1' : '#0f172a',
                color: '#f8fafc',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Avgångar
            </button>
            <button
              type="button"
              onClick={() => setDirection('arrivals')}
              style={{
                padding: '7px 14px',
                borderRadius: '9px',
                border: direction === 'arrivals' ? '1px solid #10b981' : '1px solid #334155',
                backgroundColor: direction === 'arrivals' ? '#047857' : '#0f172a',
                color: '#f8fafc',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Ankomster
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {currentRegionObj.modes.map((m) => {
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '9px',
                    border: active ? '1px solid #38bdf8' : '1px solid #334155',
                    backgroundColor: active ? '#0284c7' : '#0f172a',
                    color: '#f8fafc',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '10px',
          }}
        >
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={stationQuery}
              onChange={(e) => setStationQuery(e.target.value)}
              placeholder="Sök valfri station eller hållplats i Sverige..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '11px 14px',
                borderRadius: '11px',
                border: '1px solid #38bdf8',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                fontSize: '13px',
              }}
            />

            {searchingStops || suggestions.length > 0 ? (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '6px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #38bdf8',
                  borderRadius: '11px',
                  zIndex: 20,
                  overflow: 'hidden',
                  boxShadow: '0 14px 30px rgba(0,0,0,0.65)',
                }}
              >
                {searchingStops ? (
                  <div style={{ padding: '11px 14px', color: '#94a3b8', fontSize: '13px' }}>
                    Söker platser...
                  </div>
                ) : (
                  suggestions.map((stop) => (
                    <button
                      key={stop.id}
                      type="button"
                      onClick={() => {
                        setSelectedStop(stop);
                        setRegion('all');
                        setMode('all');
                        setStationQuery('');
                        setSuggestions([]);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '11px 14px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid #1e293b',
                        color: '#f8fafc',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      {stop.name}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrera linje (t.ex. 19, 4, 535), destination eller stopp..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '11px 14px',
              borderRadius: '11px',
              border: '1px solid #334155',
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              fontSize: '13px',
            }}
          />
        </div>
      </section>

      {hasDisruptions ? (
        <div
          id="storningsruta"
          style={{
            backgroundColor: 'rgba(120, 53, 15, 0.35)',
            border: '1px solid #d97706',
            borderRadius: '14px',
            padding: '13px 16px',
            marginBottom: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '13px', color: '#fde68a', fontWeight: 500 }}>
            Försenad eller inställd avgång? Se vilka rättigheter du har vid trafikstörningar.
          </span>
          <a
            href="https://www.hallakonsument.se/varor-och-tjanster/resor/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              backgroundColor: '#f59e0b',
              color: '#0f172a',
              fontWeight: 800,
              fontSize: '12px',
              padding: '7px 13px',
              borderRadius: '8px',
              textDecoration: 'none',
            }}
          >
            Läs om reseersättning
          </a>
        </div>
      ) : null}

      <section id="avgangstavla" style={{ marginBottom: '36px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block' }}>
              {direction === 'arrivals' ? 'Visar ankomster till' : 'Visar avgångar från'}
            </span>
            <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
              {selectedStop.name} ({filtered.length})
            </h2>
          </div>

          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              padding: '5px 11px',
              borderRadius: '999px',
              backgroundColor: 'rgba(6, 78, 59, 0.75)',
              border: '1px solid #059669',
              color: '#6ee7b7',
            }}
          >
            Live från Trafiklab
          </span>
        </div>

        {errorMsg ? (
          <div
            style={{
              backgroundColor: '#7f1d1d',
              color: '#fecaca',
              padding: '16px',
              borderRadius: '12px',
              fontSize: '14px',
            }}
          >
            {errorMsg}
          </div>
        ) : loading ? (
          <div
            style={{
              padding: '28px',
              textAlign: 'center',
              borderRadius: '14px',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              color: '#94a3b8',
            }}
          >
            Hämtar tidtabell i realtid...
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: '28px',
              textAlign: 'center',
              borderRadius: '14px',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              color: '#94a3b8',
            }}
          >
            Inga träffar hittades för valt trafikslag på denna station. Prova att välja{' '}
            <strong>Alla</strong> eller byt station.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {filtered.map((item) => {
              const isDelayed = item.status === 'delayed';
              const isCancelled = item.status === 'cancelled';
              const isSelectedTrip = onBoardTrip ? onBoardTrip.id === item.id : false;
              const displayedNewTime = isDelayed ? item.newTime || item.estimatedTime : '';

              const badgeBg = isCancelled
                ? 'rgba(127, 29, 29, 0.8)'
                : isDelayed
                ? 'rgba(120, 53, 15, 0.85)'
                : 'rgba(6, 78, 59, 0.7)';
              const badgeBorder = isCancelled
                ? '#dc2626'
                : isDelayed
                ? '#d97706'
                : '#059669';
              const badgeColor = isCancelled
                ? '#fca5a5'
                : isDelayed
                ? '#fcd34d'
                : '#6ee7b7';
              const statusLabel = isCancelled
                ? 'Inställd'
                : isDelayed
                ? `Ny tid ${displayedNewTime}${
                    item.delayMinutes ? ` (+${item.delayMinutes} min)` : ''
                  }`
                : 'I tid';

              const metaParts = [item.line, item.operator, item.track].filter(Boolean);

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: isSelectedTrip ? 'rgba(2, 132, 199, 0.14)' : '#0f172a',
                    border: isSelectedTrip ? '1px solid #38bdf8' : '1px solid #1e293b',
                    borderRadius: '13px',
                    padding: '13px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        minWidth: '82px',
                        paddingRight: '12px',
                        borderRight: '1px solid #1e293b',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>
                        ORD. TID
                      </div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 800,
                          fontVariantNumeric: 'tabular-nums',
                          textDecoration:
                            isDelayed || isCancelled ? 'line-through' : 'none',
                          color:
                            isDelayed || isCancelled ? '#64748b' : '#f8fafc',
                        }}
                      >
                        {item.scheduledTime}
                      </div>
                      {displayedNewTime ? (
                        <div style={{ marginTop: '3px' }}>
                          <span
                            style={{
                              display: 'block',
                              fontSize: '10px',
                              color: '#fbbf24',
                              fontWeight: 800,
                            }}
                          >
                            NY TID
                          </span>
                          <span
                            style={{
                              fontSize: '15px',
                              fontWeight: 800,
                              fontVariantNumeric: 'tabular-nums',
                              color: '#fbbf24',
                            }}
                          >
                            {displayedNewTime}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                        {direction === 'arrivals' ? `Från ${item.destination}` : item.destination}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
                        {metaParts.map((part, i) => (
                          <React.Fragment key={i}>
                            {i > 0 ? ' | ' : ''}
                            <span
                              style={
                                i === 0
                                  ? { color: '#38bdf8', fontWeight: 600 }
                                  : undefined
                              }
                            >
                              {part}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                      {item.deviation ? (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#fbbf24',
                            fontWeight: 600,
                            marginTop: '4px',
                          }}
                        >
                          Avvikelse: {item.deviation}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleSelectOnBoard(item)}
                      style={{
                        padding: '6px 11px',
                        borderRadius: '8px',
                        border: isSelectedTrip ? '1px solid #38bdf8' : '1px solid #334155',
                        backgroundColor: isSelectedTrip ? '#0284c7' : '#1e293b',
                        color: '#f8fafc',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {isSelectedTrip ? 'Vald resa' : 'Jag är ombord'}
                    </button>

                    <span
                      style={{
                        backgroundColor: badgeBg,
                        border: `1px solid ${badgeBorder}`,
                        color: badgeColor,
                        padding: '5px 11px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section
        id="om-tjansten"
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '26px',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 10px 0', color: '#f8fafc' }}>
          Så fungerar avgångstavlan på alltiditid.se
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.65, margin: '0 0 12px 0' }}>
          På <strong style={{ color: '#e2e8f0' }}>alltiditid.se</strong> samlar vi realtidsinformation
          om kollektivtrafik i Sverige så att du snabbt kan se när nästa tåg, T-bana, spårvagn,
          pendel eller buss avgår eller ankommer, om den är i tid eller försenad samt vilket spår
          eller läge som gäller.
        </p>
        <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.65, margin: 0 }}>
          Sitter du redan ombord? Växla till <strong>Ankomster</strong> på din avstigningsstation
          (t.ex. Lund C), filtrera på linje eller tågnummer och klicka på{' '}
          <strong>Jag är ombord</strong> för att skicka din status till den som hämtar dig.
        </p>
      </section>

      <footer
        id="sidfot"
        style={{
          borderTop: '1px solid #1e293b',
          paddingTop: '20px',
          paddingBottom: '24px',
          color: '#94a3b8',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveInfoTab('about')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #334155',
              backgroundColor: activeInfoTab === 'about' ? '#1e293b' : 'transparent',
              color: '#f8fafc',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Om alltiditid.se
          </button>
          <button
            type="button"
            onClick={() => setActiveInfoTab('privacy')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #334155',
              backgroundColor: activeInfoTab === 'privacy' ? '#1e293b' : 'transparent',
              color: '#f8fafc',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Integritetspolicy &amp; cookies
          </button>
          <button
            type="button"
            onClick={() => setActiveInfoTab('terms')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #334155',
              backgroundColor: activeInfoTab === 'terms' ? '#1e293b' : 'transparent',
              color: '#f8fafc',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Ansvarsfriskrivning
          </button>
          <button
            type="button"
            onClick={() => setActiveInfoTab('contact')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #334155',
              backgroundColor: activeInfoTab === 'contact' ? '#1e293b' : 'transparent',
              color: '#f8fafc',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Kontakt
          </button>
        </div>

        {activeInfoTab === 'about' ? (
          <p style={{ lineHeight: 1.6, margin: '0 0 14px 0' }}>
            alltiditid.se är en oberoende informationstjänst som visar aktuella avgångstider,
            ankomster och förseningsdata baserat på öppna trafikdata.
          </p>
        ) : null}
        {activeInfoTab === 'privacy' ? (
          <p style={{ lineHeight: 1.6, margin: '0 0 14px 0' }}>
            Vi samlar inte in personuppgifter genom stationssökningar. Vid annonsering via tredje
            part (såsom Google AdSense) kan cookies eller liknande tekniker användas för att visa
            relevanta annonser och mäta trafik.
          </p>
        ) : null}
        {activeInfoTab === 'terms' ? (
          <p style={{ lineHeight: 1.6, margin: '0 0 14px 0' }}>
            Realtidsdata kan ändras med kort varsel vid trafikstörningar. Kontrollera alltid
            operatörens officiella information på plats innan avresa.
          </p>
        ) : null}
        {activeInfoTab === 'contact' ? (
          <p style={{ lineHeight: 1.6, margin: '0 0 14px 0' }}>
            Har du frågor, synpunkter eller förslag på förbättringar? Kontakta oss via e-post på{' '}
            <a
              href="mailto:kontakt@alltiditid.se"
              style={{ color: '#38bdf8', textDecoration: 'underline' }}
            >
              kontakt@alltiditid.se
            </a>
            .
          </p>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          <span>2026 alltiditid.se – Alla rättigheter förbehållna.</span>
          <a
            href="mailto:kontakt@alltiditid.se"
            style={{ color: '#94a3b8', textDecoration: 'none' }}
          >
            kontakt@alltiditid.se
          </a>
        </div>
      </footer>
    </div>
  );
}
