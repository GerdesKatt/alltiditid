'use client';

import React from 'react';
import { colors } from './styles';
import { useLang } from '../lib/i18n';

export type StopLink = { slug: string; name: string; note?: string };

/** En lista med länkar till hållplatssidor, för besökare och sökmotorer. */
export default function StopLinks({
  title: titleSv,
  titleEn,
  links,
}: {
  title: string;
  /** Rubriken på engelska; saknas den används den svenska. */
  titleEn?: string;
  links: StopLink[];
}) {
  const { t } = useLang();
  if (links.length === 0) return null;
  const title = t(titleSv, titleEn || titleSv);
  return (
    <nav aria-label={title} style={{ marginTop: '18px' }}>
      <h3 style={{ fontSize: 'var(--fs-3)', fontWeight: 700, margin: '0 0 8px 0', color: colors.text }}>{title}</h3>
      {/* En lista under ett streck, inga grå chips: namn till vänster, avstånd till höger. */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${colors.text}` }}>
        {links.map((l) => (
          <li key={l.slug} style={{ borderBottom: `1px solid ${colors.border}` }}>
            <a
              href={`/${l.slug}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                minHeight: '44px',
                color: colors.text,
                fontSize: 'var(--fs-3)',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {l.name}
              {l.note ? (
                <span style={{ color: colors.textDim, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>
                  {t(l.note, l.note.replace(/(\d),(\d)/, '$1.$2'))}
                </span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
