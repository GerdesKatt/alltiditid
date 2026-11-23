'use client';

import React, { useEffect, useState } from 'react';

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

type TransportMode = 'all' | 'train' | 'bus' | 'flight';

const QUICK_STATIONS: StopOption[] = [
  { id: '740000001', name: 'Stockholm Centralstation' },
  { id: '740000002', name: 'Göteborg Centralstation' },
  { id: '740000003', name: 'Malmö Centralstation' },
  { id: '740000120', name: 'Lund Centralstation' },
  { id: '740000072', name: 'Karlstad Centralstation' },
  { id: '740000556', name: 'Stockholm Arlanda Airport' },
];

const MODES: { key: TransportMode; label: string }[] = [
  { key: 'all', label: 'Alla' },
  { key: 'train', label: 'Tåg' },
  { key: 'bus', label: 'Buss' },
  { key: 'flight', label: 'Flyg' },
];

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
        if (!res.ok) throw new Error(data.error || 'Fel vid hamtning');
        return data;
      })
      .then((data) => {
        if (!active) return;
        setDepartures(data.departures || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err.message || 'Kunde inte hamta avgangar just nu.');
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

  return (
    <div id="alltiditid-app" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <header
        id="sidhuvud"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 18px',
          marginBottom: '20px',
          borderRadius: '16px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '14px',
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
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
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
                color: '#f8fafc',
              }}
            >
              alltid<span style={{ color: '#38bdf8' }}>itid</span>
              <span style={{ color: '#64748b', fontWeight: 700, fontSize: '15px' }}>.se</span>
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Avgangar i realtid</span>
          </span>
        </a>

        <nav style={{ display: 'flex', gap: '16px', fontSize: '13px', fontWeight: 600 }}>
          <a href="#avgangstavla" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
            Avgangstavla
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

      <section
        id="sok-och-filter"
        style={{
          marginBottom: '24px',
          padding: '22px',
          borderRadius: '18px',
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
        }}
      >
        <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 8px 0' }}>
          Avgangar i realtid i hela Sverige
        </h1>
        <p style={{ color: '#94a3b8', margin: '0 0 16px 0', fontSize: '14px' }}>
          Folj aktuella avgangar, spar och eventuella forseningar for tag, buss och flyg.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: active ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: active ? '#0369a1' : '#1e293b',
                  color: '#f8fafc',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
          {QUICK_STATIONS.map((stop) => {
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
                  padding: '6px 13px',
                  borderRadius: '999px',
                  border: active ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: active ? '#0284c7' : '#1e293b',
                  color: '#f8fafc',
                  fontWeight: 600,
                  fontSize: '12px',
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

        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            type="text"
            value={stationQuery}
            onChange={(e) => setStationQuery(e.target.value)}
            placeholder="Sok station, hallplats eller flygplats..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #38bdf8',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              fontSize: '14px',
            }}
          />

          {searchingStops || suggestions.length > 0 ? (
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
              }}
            >
              {searchingStops ? (
                <div style={{ padding: '12px 14px', color: '#94a3b8', fontSize: '14px' }}>
                  Soker platser...
                </div>
              ) : (
                suggestions.map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
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
          ) : null}
        </div>

        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filtrera pa destination, linje eller bolag..."
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

      <section id="avgangstavla" style={{ marginBottom: '36px' }}>
        <h2 style={{ fontSize: '18px', margin: '0 0 12px 0' }}>{selectedStop.name}</h2>

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
          <p style={{ color: '#94a3b8' }}>Hamtar avgangar i realtid...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>Inga avgangar hittades for valt trafikslag eller filter.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map((item) => {
              const isDelayed = item.status === 'delayed';
              const isCancelled = item.status === 'cancelled';

              const badgeBg = isCancelled ? '#7f1d1d' : isDelayed ? '#78350f' : '#064e3b';
              const badgeColor = isCancelled ? '#fca5a5' : isDelayed ? '#fcd34d' : '#6ee7b7';
              const statusLabel = isCancelled
                ? 'Installd'
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
                      {isDelayed ? (
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24' }}>
                          {item.estimatedTime}
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 700 }}>{item.destination}</div>
                      <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                        {item.line} | {item.operator} | {item.track}
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
      </section>

      <footer
        id="sidfot"
        style={{
          borderTop: '1px solid #1e293b',
          paddingTop: '20px',
          color: '#94a3b8',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveInfoTab('about')}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid #334155',
              backgroundColor: activeInfoTab === 'about' ? '#1e293b' : 'transparent',
              color: '#f8fafc',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Om alltiditid.se
          </button>
          <button
            type="button"
            onClick={() => setActiveInfoTab('privacy')}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid #334155',
              backgroundColor: activeInfoTab === 'privacy' ? '#1e293b' : 'transparent',
              color: '#f8fafc',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Integritetspolicy &amp; cookies
          </button>
          <button
            type="button"
            onClick={() => setActiveInfoTab('terms')}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid #334155',
              backgroundColor: activeInfoTab === 'terms' ? '#1e293b' : 'transparent',
              color: '#f8fafc',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Ansvarsfriskrivning
          </button>
          <button
            type="button"
            onClick={() => setActiveInfoTab('contact')}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid #334155',
              backgroundColor: activeInfoTab === 'contact' ? '#1e293b' : 'transparent',
              color: '#f8fafc',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Kontakt
          </button>
        </div>

        {activeInfoTab === 'about' ? (
          <p style={{ lineHeight: 1.6, margin: '0 0 12px 0' }}>
            alltiditid.se ar en oberoende informationstjanst som visar aktuella avgangstider och
            forseningar baserat pa oppna trafikdata.
          </p>
        ) : null}
        {activeInfoTab === 'privacy' ? (
          <p style={{ lineHeight: 1.6, margin: '0 0 12px 0' }}>
            Vi samlar inte in personuppgifter genom stationssokningar. Vid annonsering via tredje
            part (sasom Google AdSense) kan cookies eller liknande tekniker anvandas.
          </p>
        ) : null}
        {activeInfoTab === 'terms' ? (
          <p style={{ lineHeight: 1.6, margin: '0 0 12px 0' }}>
            Realtidsdata kan andras med kort varsel vid trafikstorningar. Kontrollera alltid
            operatorens officiella information pa plats.
          </p>
        ) : null}
        {activeInfoTab === 'contact' ? (
          <p style={{ lineHeight: 1.6, margin: '0 0 12px 0' }}>
            Kontakt via e-post:{' '}
            <a
              href="mailto:kontakt@alltiditid.se"
              style={{ color: '#38bdf8', textDecoration: 'underline' }}
            >
              kontakt@alltiditid.se
            </a>
            .
          </p>
        ) : null}

        <div style={{ fontSize: '12px', color: '#64748b' }}>
          2026 alltiditid.se – kontakt@alltiditid.se
        </div>
      </footer>
    </div>
  );
}
