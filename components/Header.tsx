'use client';
import ThemeButton from './ThemeButton';

import React from 'react';
import { colors, fonts } from './styles';
import { useLang } from '../lib/i18n';

type Props = {
  onContactClick?: () => void;
  /** Ordmärket leder till Hem. */
  onHome?: () => void;
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

export default function Header({ onContactClick, onHome, linkBase = '' }: Props) {
  const { lang, t, setLang } = useLang();
  // På mobilen glider sidhuvudet undan när man scrollar nedåt och kommer tillbaka uppåt,
  // så att de fasta fälten tar mindre av skärmen (UX-revisionen, fynd 11). Se .site-header i globals.css.
  React.useEffect(() => {
    let last = window.scrollY;
    const root = document.documentElement;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > 120 && y > last + 4) root.dataset.headerHidden = '1';
      else if (y < last - 4 || y <= 120) delete root.dataset.headerHidden;
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      delete root.dataset.headerHidden;
    };
  }, []);
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
        borderBottom: `1px solid ${colors.border}`,
        flexWrap: 'wrap',
        gap: '12px',
      }}
    >
      <a
        href={onHome ? "#alltiditid-app" : `${linkBase || "/"}`}
        onClick={(e) => {
          if (!onHome) return;
          e.preventDefault();
          onHome();
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '12px',
          textDecoration: 'none',
          maxWidth: '100%',
        }}
      >
        {/* Ordmärket: alltid i tid i gemener, Archivo 800, under strecket (över hela skärmen, se .site-header), sloganen under. */}
        <span
          className="wordmark"
          style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
        >
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: '1.375rem',
              fontWeight: 800,
              letterSpacing: '-0.035em',
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
              fontSize: '0.75rem',
              fontWeight: 400,
              color: colors.textDim,
              marginTop: '5px',
            }}
          >
            {t('För oss som inte kommer sent.', 'For those of us who are never late.')}
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
        {/* Skärmläge och språk syns även på mobilen, där menyn är dold. */}
        <ThemeButton />
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
