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
  const [activeInfoTab, setActiveInfoTab] = useState<'about' | 'privacy' | 'terms'>('about');

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
    <div id="alltiditid-app">
      {/* Toppmeny / Varumärkesrad */}
      <header
        id="sidhuvud"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '16px',
          marginBottom: '20px',
          borderBottom: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <span style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.02em', color: '#38bdf8' }}>
            alltiditid.se
          </span>
          <span style={{ marginLeft: '10px', fontSize: '13px', color: '#94a3b8' }}>
            Realtidsinformation för resenärer i Sverige
          </span>
        </div>
        <nav style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
          <a href="#avgangstavla" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
            Avgångstavla
          </a>
          <a href="#om-tjansten" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
            Om tjänsten
          </a>
          <a href="#sidfot" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
            Integritet &amp; Villkor
          </a>
        </nav>
      </header>

      <section id="sok-och-filter" style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 8px 0' }}>
          Avgångar i realtid i hela Sverige
        </h1>
        <p style={{ color: '#94a3b8', margin: '0 0 16px 0', fontSize: '15px', lineHeight: 1.5 }}>
          Följ aktuella avgångar, spår och eventuella förseningar för tåg, buss och flyg på
          stationer och hållplatser i hela landet.
        </p>

        {/* Trafikslagsfilter: Alla / Tåg / Buss / Flyg */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: active ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: active ? '#0369a1' : '#0f172a',
                  color: '#f8fafc',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Snabbval av platser */}
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
                  if (stop.id === '740000556' && mode === 'train') {
                    setMode('all');
                  }
                }}
                style={{
                  padding: '7px 13px',
                  borderRadius: '999px',
                  border: active ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: active ? '#0284c7' : '#1e293b',
                  color: '#f8fafc',
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

        {/* Sök valfri station/flygplats i Sverige */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            type="text"
            value={stationQuery}
            onChange={(e) => setStationQuery(e.target.value)}
            placeholder="Sök station, hållplats eller flygplats (t.ex. Karlstad, Landvetter, Sundsvall)..."
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
          placeholder="Filtrera på destination, linje eller bolag (t.ex. SJ, Västtrafik, Göteborg)..."
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
          id="storningsruta"
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
            Försenad eller inställd avgång? Kontrollera dina rättigheter vid trafikstörningar.
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
            Läs om reseersättning &rarr;
          </a>
        </div>
      )}

      <section id="avgangstavla" style={{ marginBottom: '36px' }}>
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
          <p style={{ color: '#94a3b8' }}>
            Inga avgångar hittades för valt trafikslag eller filter.
          </p>
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
      </section>

      {/* Redaktionellt innehåll som ger tydligt värde och text för besökare och sökmotorer */}
      <section
        id="om-tjansten"
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '28px',
        }}
      >
        <h2 style={{ fontSize: '18px', margin: '0 0 10px 0' }}>
          Så fungerar avgångstavlan på alltiditid.se
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, margin: '0 0 12px 0' }}>
          På <strong style={{ color: '#e2e8f0' }}>alltiditid.se</strong> samlar vi realtidsinformation
          om kollektivtrafik i Sverige så att du snabbt kan se när nästa tåg, buss eller
          förbindelse avgår, om den är i tid eller försenad samt vilket spår eller läge som gäller.
        </p>
        <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
          Börja med att välja en av snabbknapparna eller sök fram valfri hållplats och station i
          Sverige. Du kan därefter filtrera på destination, linjenummer eller operatör för att
          snabbare hitta rätt resa i vardagen eller vid längre resor.
        </p>
      </section>

      {/* Sidfot med flikar för Om oss, Integritetspolicy och Villkor */}
      <footer
        id="sidfot"
        style={{
          borderTop: '1px solid #1e293b',
          paddingTop: '20px',
          color: '#94a3b8',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
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
        </div>

        {activeInfoTab === 'about' && (
          <p style={{ lineHeight: 1.6, margin: '0 0 12px 0' }}>
            alltiditid.se är en oberoende informationstjänst som visar aktuella avgångstider och
            förseningar baserat på öppna trafikdata.
          </p>
        )}
        {activeInfoTab === 'privacy' && (
          <p style={{ lineHeight: 1.6, margin: '0 0 12px 0' }}>
            Vi samlar inte in personuppgifter genom stationssökningar. Vid annonsering via tredje
            part (såsom Google AdSense) kan cookies eller liknande tekniker användas för att visa
            relevanta annonser och mäta trafik.
          </p>
        )}
        {activeInfoTab === 'terms' && (
          <p style={{ lineHeight: 1.6, margin: '0 0 12px 0' }}>
            Realtidsdata kan ändras med kort varsel vid trafikstörningar. Kontrollera alltid
            operatörens officiella information på plats innan avresa.
          </p>
        )}

        <div style={{ fontSize: '12px', color: '#64748b' }}>
          © {new Date().getFullYear()} alltiditid.se – Alla rättigheter förbehållna.
        </div>
      </footer>
    </div>
  );
}
