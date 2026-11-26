'use client';

import React from 'react';
import { colors, fonts } from './styles';
import { useLang } from '../lib/i18n';

type Props = {
  onContactClick?: () => void;
  /** "/" på sidor utan tavla, så att länkarna går till startsidan. */
  linkBase?: string;
};

// Minst 44 px höga tryckytor (var 15 px).
const navLink = {
  color: colors.textMuted,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '44px',
  padding: '0 4px',
} as const;

export default function Header({ onContactClick, linkBase = '' }: Props) {
  const { lang, t, setLang } = useLang();
  return (
    <header
      id="sidhuvud"
      className="site-header"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        marginBottom: '16px',
        borderRadius: 'var(--radius-card)',
        backgroundColor: colors.headerBg,
        border: `1px solid ${colors.border}`,
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
          maxWidth: '100%',
        }}
      >
        {/* Symbolen: en linje som fylls och en prick som pulserar (brand guiden). */}
        <svg width="36" height="36" viewBox="0 0 120 120" aria-hidden="true" style={{ flexShrink: 0 }}>
          <rect width="120" height="120" rx="26" fill="var(--brand)" />
          <rect x="18" y="64" width="84" height="14" rx="7" fill="var(--on-brand)" opacity=".45" />
          <rect x="18" y="64" width="56" height="14" rx="7" fill="var(--on-brand)" />
          <circle cx="74" cy="71" r="16" fill="var(--on-brand)" />
        </svg>

        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: '1.375rem',
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 1.1,
              color: colors.text,
            }}
          >
            alltid<span style={{ color: colors.brand }}>i</span>tid
          </span>
          <span
            className="site-tagline"
            style={{
              overflowWrap: 'anywhere',
              fontSize: '0.8125rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: colors.textDim,
              marginTop: '2px',
            }}
          >
            {t('Avgångar och ankomster i realtid', 'Departures and arrivals in real time')}
          </span>
        </span>
      </a>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px', marginLeft: 'auto' }}>
        <nav className="site-nav" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: '0.8125rem', fontWeight: 600 }}>
          <a href={`${linkBase}#avgangstavla`} className="site-nav-board" style={navLink}>
            {t('Tidtabell', 'Timetable')}
          </a>
          <a href={`${linkBase}#om-tjansten`} style={navLink}>
            {t('Om tjänsten', 'About')}
          </a>
          <a
            href={`${linkBase}#sidfot`}
            onClick={onContactClick}
            style={{ ...navLink, color: colors.accent }}
          >
            {t('Kontakt', 'Contact')}
          </a>
        </nav>
        {/* Språkväljaren syns även på mobilen, där menyn är dold. */}
        <button
          type="button"
          onClick={() => setLang(lang === 'en' ? 'sv' : 'en')}
          lang={lang === 'en' ? 'sv' : 'en'}
          aria-label={lang === 'en' ? 'Byt till svenska' : 'Switch to English'}
          style={{
            ...navLink,
            gap: '6px',
            border: 'none',
            background: 'none',
            font: 'inherit',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
          </svg>
          {lang === 'en' ? 'Svenska' : 'English'}
        </button>
      </div>
    </header>
  );
}
