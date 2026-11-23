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

export default function HomePage() {
  const [station, setStation] = useState('Stockholm C');
  const [search, setSearch] = useState('');
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [source, setSource] = useState<'live' | 'demo'>('live');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch(`/api/departures?station=${encodeURIComponent(station)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setDepartures(data.departures || []);
        setSource(data.source || 'demo');
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
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
            backgroundColor: source === 'live' ? '#064e3b' : '#1e293b',
            color: source === 'live' ? '#6ee7b7' : '#94a3b8',
          }}
        >
          {source === 'live' ? '● Live från Trafiklab' : '● Demo-tidtabell'}
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
