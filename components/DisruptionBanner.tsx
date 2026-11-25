import React from 'react';

export default function DisruptionBanner() {
  return (
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
  );
}
