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
};

type StopOption = {
  id: string;
  name: string;
};

const QUICK_STATIONS: StopOption[] = [
  { id: '740000001', name: 'Stockholm Centralstation' },
  { id: '740000002', name: 'Göteborg Centralstation' },
  { id: '740000003', name: 'Malmö Centralstation' },
  { id: '740000072', name: 'Karlstad Centralstation' },
  { id: '740000005', name: 'Uppsala Centralstation' },
];

export default function HomePage() {
  const [selectedStop, setSelectedStop] = useState<StopOption>(QUICK_STATIONS[0]);
  const [stationQuery, setStationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StopOption[]>([]);
  const [searchingStops, setSearchingStops] = useState(false);

  const [filterText, setFilterText] = useState('');
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sök hållplatser i hela Sverige när man skriver i stationsrutan
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

  // Hämta realtidsavgångar för vald station
  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg(null);

    fetch(`/api/trafik?action=departures&stopId=${encodeURIComponent(selectedStop.id)}`)
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
  }, [selectedStop]);

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
    <div>
      <section style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 8px 0' }}>
          Avgångar i realtid i hela Sverige
        </h1>
        <p style={{ color: '#94a3b8', margin: '0 0 16px 0', fontSize: '15px' }}>
          Sök på valfri tågstation eller busshållplats nedan för att se aktuella avgångar och förseningar.
        </p>

        {/* Snabbval */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
          {QUICK_STATIONS.map((stop) => {
            const active = selectedStop.id === stop.id;
            return (
              <button
                key={stop.id}
                onClick={() => {
                  setSelectedStop(stop);
                  setStationQuery('');
                  setSuggestions([]);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: active ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: active ? '#0284c7' : '#1e293b',
                  color: '#f8fafc',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {stop.name.replace(' Centralstation', ' C')}
              </button>
            );
          })}
        </div>

        {/* Sök valfri station i Sverige */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            type="text"
            value={stationQuery}
            onChange={(e) => setStationQuery(e.target.value)}
            placeholder="Sök station eller hållplats (t.ex. Karlstad, Sundsvall, Slussen)..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '13px 14px',
              borderRadius: '10px',
              border: '1px solid #38bdf8',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              fontSize: '15px',
            }}
          />

          {(searchingStops || suggestions.length > 0) && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '10px',
                zIndex: 20,
                overflow: 'hidden',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              }}
            >
              {searchingStops ? (
                <div style={{ padding: '12px 14px', color: '#94a3b8', fontSize: '14px' }}>
                  Söker hållplatser...
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

        {/* Filtrera avgångar från vald station */}
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder={`Filtrera avgångar från ${selectedStop.name} på destination eller linje...`}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid #334155',
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            fontSize: '14px',
          }}
        />
      </section>

      {hasDisruptions && (
        <div
          style={{
            backgroundColor: '#422006',
            border: '1px solid #ca8a04',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '14px', color: '#fef08a' }}>
            Försenad eller inställd avgång? Du kan ha rätt till reseersättning.
          </span>
          <a
            href="https://www.hallakonsument.se/varor-och-tjanster/resor/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              backgroundColor: '#eab308',
              color: '#0f172a',
              fontWeight: 700,
              fontSize: '13px',
              padding: '6px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
            }}
          >
            Kolla dina rättigheter &rarr;
          </a>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <h2 style={{ fontSize: '18px', margin: 0 }}>{selectedStop.name}</h2>
        <span
          style={{
            fontSize: '12px',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: '#064e3b',
            color: '#6ee7b7',
          }}
        >
          ● Live från Trafiklab
        </span>
      </div>

      {errorMsg ? (
        <div
          style={{
            backgroundColor: '#7f1d1d',
            color: '#fecaca',
            padding: '14px',
            borderRadius: '10px',
            fontSize: '14px',
          }}
        >
          {errorMsg}
        </div>
      ) : loading ? (
        <p style={{ color: '#94a3b8' }}>Hämtar avgångar i realtid...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>Inga avgångar hittades för denna filtrering.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map((item) => {
            const isDelayed = item.status === 'delayed';
            const isCancelled = item.status === 'cancelled';

            const badgeBg = isCancelled
              ? '#7f1d1d'
              : isDelayed
              ? '#78350f'
              : '#064e3b';
            const badgeColor = isCancelled
              ? '#fca5a5'
              : isDelayed
              ? '#fcd34d'
              : '#6ee7b7';
            const statusLabel = isCancelled
              ? 'Inställd'
              : isDelayed
              ? `Ny tid ${item.estimatedTime}`
              : 'I tid';

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ minWidth: '54px' }}>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 800,
                        textDecoration: isDelayed || isCancelled ? 'line-through' : 'none',
                        color: isDelayed || isCancelled ? '#94a3b8' : '#f8fafc',
                      }}
                    >
                      {item.scheduledTime}
                    </div>
                    {isDelayed && (
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24' }}>
                        {item.estimatedTime}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 700 }}>
                      {item.destination}
                    </div>
                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                      {item.line} &bull; {item.operator} &bull; {item.track}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    backgroundColor: badgeBg,
                    color: badgeColor,
                    padding: '5px 10px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {statusLabel}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
