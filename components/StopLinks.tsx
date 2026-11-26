import React from 'react';
import { colors } from './styles';

export type StopLink = { slug: string; name: string; note?: string };

/** En lista med länkar till hållplatssidor, för besökare och sökmotorer. */
export default function StopLinks({ title, links }: { title: string; links: StopLink[] }) {
  if (links.length === 0) return null;
  return (
    <nav aria-label={title} style={{ marginTop: '18px' }}>
      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 8px 0', color: colors.text }}>{title}</h3>
      <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', listStyle: 'none', margin: 0, padding: 0 }}>
        {links.map((l) => (
          <li key={l.slug}>
            <a
              href={`/${l.slug}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '40px',
                padding: '0 12px',
                borderRadius: 'var(--radius-control)',
                backgroundColor: colors.surfaceRaised,
                color: colors.text,
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {l.name}
              {l.note ? <span style={{ color: colors.textDim, fontWeight: 500 }}>{l.note}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
