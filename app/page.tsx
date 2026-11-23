'use client';

import { useEffect, useState } from 'react';

type Departure = {
  id: string;
  line: string;
  operator: string;
  destination: string;
  scheduledTime: string;
  estimatedTime: string;
  status: 'on-time' | 'delayed' | 'cancelled';
  track: string;
  vehicleType?: string;
};

type StopOption = {
  id: string;
  name: string;
};

type TransportMode = 'all' | 'train' | 'bus' | 'flight';

const QUICK_STATIONS: StopOption[] = [
  { id: '740000001', name: 'Stockholm Centralstation' },
  { id: '740000002', name: 'Göteborg Centralstation' },
  { id: '740000003', name: 'Malmö Centralstation' },
  { id: '740000072', name: 'Karlstad Centralstation' },
  { id: '740000556', name: 'Stockholm Arlanda Airport' },
];

const MODES: { key: TransportMode; label: string }[] = [
  { key: 'all', label: 'Alla trafikslag' },
  { key: 'train', label: 'Tåg' },
  { key: 'bus', label: 'Buss' },
  { key: 'flight', label: 'Flyg' },
];

function BrandLogo() {
  return (
    <a
      href="#alltiditid-app"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
        textDecoration: 'none',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #0284c7 0%, #0f172a 100%)',
          border: '1px solid rgba(56, 189, 248, 0.45)',
          boxShadow: '0 6px 18px rgba(2, 132, 199, 0.28)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="8.5"
            stroke="#38bdf8"
            strokeWidth="2.2"
            strokeDasharray="42 10"
          />
          <path
            d="M12 7.5V12L15.2 14.2"
            stroke="#f8fafc"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="18.5" cy="6" r="2.5" fill="#10b981" />
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span
          style={{
            fontSize: '21px',
            fontWeight: 900,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            color: '#f8fafc',
          }}
        >
          alltid<span style={{ color: '#38bdf8' }}>itid</span>
          <span style={{ color: '#64748b', fontWeight: 700, fontSize: '16px' }}>.se</span>
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            marginTop: '2px',
          }}
        >
          Avgångar i realtid
        </span>
      </div>
    </a>
  );
}

export default function HomePage() {
  const [selectedStop, setSelectedStop] = useState<StopOption>(QUICK_STATIONS[0]);
  const [mode, setMode] = useState<TransportMode>('all');
  const [stationQuery, setStationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StopOption[]>([]);
  const [searchingStops, setSearchingStops] = useState(false);

  const [filterText, setFilterText] = useState('');
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeInfoTab, setActiveInfoTab] = useState<'about' | 'privacy' | 'terms' | 'contact'>('about');

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
      )}&mode=${mode}`
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Fel vid hämtning');
        return data;
      })
      .then((data) => {
        if (!active) return;
        setDepartures(data.departures || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err.message || 'Kunde inte hämta avgångar just nu.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedStop, mode]);

  const filtered = departures.filter(
    (d) =>
      d.destination.toLowerCase().includes(filterText.toLowerCase()) ||
      d.line.toLowerCase().includes(filterText.toLowerCase()) ||
      d.operator.toLowerCase().includes(filterText.toLowerCase())
  );

  const hasDisruptions = filtered.some(
    (d) => d.status === 'delayed' || d.status === 'cancelled'
  );

  return (
    <div id="alltiditid-app" style={{ maxWidth: '860px', margin: '0 auto' }}>
      {/* Toppmeny med logotyp */}
      <header
        id="sidhuvud"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 18px',
          marginBottom: '24px',
          borderRadius: '16px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <BrandLogo />

        <nav style={{ display: 'flex', gap: '18px', fontSize: '13px', fontWeight: 600 }}>
          <a href="#avgangstavla" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
            Avgångstavla
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

      {/* Hero & Sökkort */}
      <section
        id="sok-och-filter"
        style={{
          marginBottom: '26px',
          padding: '24px',
          borderRadius: '20px',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid #334155',
          boxShadow: '0 14px 35px rgba(2, 6, 23, 0.45)',
        }}
      >
        <h1
          style={{
            fontSize: '30px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            margin: '0 0 8px 0',
            color: '#f8fafc',
          }}
        >
          Koll på avgången i realtid
        </h1>
        <p style={{ color: '#94a3b8', margin: '0 0 20px 0', fontSize: '15px', lineHeight: 1.55 }}>
          Sök på valfri station, hållplats eller flygplats i Sverige och se tider, spår och
          förseningar direkt.
        </p>

        {/* Trafikslagsfilter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: active ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: active ? '#0284c7' : '#0f172a',
                  color: '#f8fafc',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Snabbval av platser */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {QUICK_STATIONS.map((stop) => {
            const active = selectedStop.id === stop.id;
            return (
              <button
                key={stop.id}
                onClick={() => {
                  setSelectedStop(stop);
                  setStationQuery('');
                  setSuggestions([]);
                  if (stop.id === '740000556' && mode === 'train') {
                    setMode('all');
                  }
                }}
                style={{
                  padding: '6px 13px',
                  borderRadius: '999px',
                  border: active ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(15, 23, 42, 0.7)',
                  color: active ? '#7dd3fc' : '#cbd5e1',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {stop.name
                  .replace(' Centralstation', ' C')
                  .replace('Stockholm Arlanda Airport', 'Arlanda')}
              </button>
            );
          })}
        </div>

        {/* Två fält bredvid varandra på bred skärm, staplade på mobil */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '12px',
          }}
        >
          {/* Sök station */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={stationQuery}
              onChange={(e) => setStationQuery(e.target.value)}
              placeholder="Sök station eller hållplats (t.ex. Uppsala, Lund)..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '13px 15px',
                borderRadius: '12px',
                border: '1px solid #38bdf8',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                fontSize: '14px',
              }}
            />

            {(searchingStops || suggestions.length > 0) && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '6px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #38bdf8',
                  borderRadius: '12px',
                  zIndex: 20,
                  overflow: 'hidden',
                  boxShadow: '0 14px 30px rgba(0,0,0,0.65)',
                }}
              >
                {searchingStops ? (
                  <div style={{ padding: '12px 14px', color: '#94a3b8', fontSize: '14px' }}>
                    Söker platser...
                  </div>
                ) : (
                  suggestions.map((stop) => (
                    <button
                      key={stop.id}
                      onClick={() => {
                        setSelectedStop(stop);
                        setStationQuery('');
                        setSuggestions([]);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px 14px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid #1e293b',
                        color: '#f8fafc',
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      {stop.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Filtrera avgångar */}
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrera destination, linje eller bolag..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '13px 15px',
              borderRadius: '12px',
              border: '1px solid #334155',
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              fontSize: '14px',
            }}
          />
        </div>
      </section>

      {hasDisruptions && (
        <div
          id="storningsruta"
          style={{
            backgroundColor: 'rgba(120, 53, 15, 0.35)',
            border: '1px solid #d97706',
            borderRadius: '14px',
            padding: '14px 18px',
            marginBottom: '22px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '14px', color: '#fde68a', fontWeight: 500 }}>
            Försenad eller inställd avgång? Se vilka rättigheter du har vid trafikstörningar.
          </span>
