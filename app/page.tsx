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
  type: 'train' | 'bus' | 'flight';
};

const POPULAR_STATIONS = ['Stockholm C', 'Göteborg C', 'Malmö C', 'Arlanda'];

const MOCK_DATA: Record<string, Departure[]> = {
  'Stockholm C': [
    { id: '1', line: 'SJ 425', operator: 'SJ Snabbtåg', destination: 'Göteborg C', scheduledTime: '14:15', estimatedTime: '14:15', status: 'on-time', track: 'Spår 10', type: 'train' },
    { id: '2', line: 'SL 43', operator: 'SL Pendeltåg', destination: 'Bålsta', scheduledTime: '14:18', estimatedTime: '14:26', status: 'delayed', track: 'Spår 1', type: 'train' },
    { id: '3', line: 'Mälartåg 237', operator: 'Mälartåg', destination: 'Uppsala C', scheduledTime: '14:22', estimatedTime: '14:22', status: 'on-time', track: 'Spår 4', type: 'train' },
    { id: '4', line: 'SJ 533', operator: 'SJ Snabbtåg', destination: 'Malmö C', scheduledTime: '14:30', estimatedTime: '14:30', status: 'cancelled', track: 'Spår 12', type: 'train' },
    { id: '5', line: 'Arlanda Express', operator: 'A-Train', destination: 'Arlanda Södra/Norra', scheduledTime: '14:35', estimatedTime: '14:35', status: 'on-time', track: 'Spår 1', type: 'train' },
  ],
  'Göteborg C': [
    { id: '6', line: 'SJ 428', operator: 'SJ Snabbtåg', destination: 'Stockholm C', scheduledTime: '14:20', estimatedTime: '14:20', status: 'on-time', track: 'Spår 4', type: 'train' },
    { id: '7', line: 'Västtåg 3214', operator: 'Västtrafik', destination: 'Alingsås', scheduledTime: '14:25', estimatedTime: '14:34', status: 'delayed', track: 'Spår 9', type: 'train' },
    { id: '8', line: 'Öresundståg 1045', operator: 'Öresundståg', destination: 'Köpenhamn H', scheduledTime: '14:40', estimatedTime: '14:40', status: 'on-time', track: 'Spår 2', type: 'train' },
  ],
  'Malmö C': [
    { id: '9', line: 'Öresundståg 1052', operator: 'Öresundståg', destination: 'Köpenhamn H', scheduledTime: '14:16', estimatedTime: '14:16', status: 'on-time', track: 'Spår 1', type: 'train' },
    { id: '10', line: 'Pågatåg 1642', operator: 'Skånetrafiken', destination: 'Lund C', scheduledTime: '14:21', estimatedTime: '14:29', status: 'delayed', track: 'Spår 3', type: 'train' },
    { id: '11', line: 'SJ 536', operator: 'SJ Snabbtåg', destination: 'Stockholm C', scheduledTime: '14:45', estimatedTime: '14:45', status: 'on-time', track: 'Spår 6', type: 'train' },
  ],
  'Arlanda': [
    { id: '12', line: 'SK 152', operator: 'SAS', destination: 'Göteborg (GOT)', scheduledTime: '15:05', estimatedTime: '15:05', status: 'on-time', track: 'Gate F32', type: 'flight' },
    { id: '13', line: 'DY 4311', operator: 'Norwegian', destination: 'Malmö (MMX)', scheduledTime: '15:20', estimatedTime: '15:55', status: 'delayed', track: 'Gate D14', type: 'flight' },
    { id: '14', line: 'LH 2417', operator: 'Lufthansa', destination: 'München (MUC)', scheduledTime: '15:40', estimatedTime: '15:40', status: 'on-time', track: 'Gate F60', type: 'flight' },
  ],
};

export default function HomePage() {
  const [station, setStation] = useState('Stockholm C');
  const [search, setSearch] = useState('');
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setDepartures(MOCK_DATA[station] || MOCK_DATA['Stockholm C']);
      setLoading(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [station]);

  const filtered = departures.filter(
    (d) =>
      d.destination.toLowerCase().includes(search.toLowerCase()) ||
      d.line.toLowerCase().includes(search.toLowerCase()) ||
      d.operator.toLowerCase().includes(search.toLowerCase())
  );

  const hasDisruptions = filtered.some(
    (d) => d.status === 'delayed' || d.status === 'cancelled'
  );

  return (
    <div>
      <section style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 8px 0' }}>
          Avgångar i realtid
        </h1>
        <p style={{ color: '#94a3b8', margin: '0 0 16px 0', fontSize: '15px' }}>
          Välj station eller flygplats nedan för att se aktuella avgångar och eventuella förseningar.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {POPULAR_STATIONS.map((name) => {
            const selected = station === name;
            return (
              <button
                key={name}
                onClick={() => setStation(name)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: selected ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: selected ? '#0284c7' : '#1e293b',
                  color: '#f8fafc',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {name}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrera på destination, linje eller bolag..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid #334155',
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            fontSize: '15px',
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
        <h2 style={{ fontSize: '18px', margin: 0 }}>{station}</h2>
        <span
          style={{
            fontSize: '12px',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: '#1e293b',
            color: '#94a3b8',
          }}
        >
          ● Avgångstavla
        </span>
      </div>

      {loading ? (
        <p style={{ color: '#94a3b8' }}>Hämtar avgångar...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>Inga avgångar matchade din filtrering.</p>
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
