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
        padding: '14px 0 12px',
        marginBottom: '20px',
        backgroundColor: colors.headerBg,
        borderBottom: `1px solid ${colors.text}`,
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
        {/* Ordmärket: gemener, inget märke. Domänen är fortfarande alltiditid.se. */}
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: '1.375rem',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              color: colors.text,
            }}
          >
            alltid i tid
          </span>
          <span
            className="site-tagline"
            style={{
              overflowWrap: 'anywhere',
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: colors.textDim,
              marginTop: '6px',
            }}
          >
            {t('För oss som inte kommer sent', 'For those of us who are never late')}
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
            style={{ ...navLink, color: colors.text }}
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
