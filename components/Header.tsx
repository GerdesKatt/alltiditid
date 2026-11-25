import React from 'react';
import { colors } from './styles';

type Props = {
  onContactClick: () => void;
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

export default function Header({ onContactClick }: Props) {
  return (
    <header
      id="sidhuvud"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        marginBottom: '16px',
        borderRadius: '16px',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
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
        }}
      >
        <span
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '11px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0f172a 100%)',
            border: '1px solid rgba(56, 189, 248, 0.45)',
            boxShadow: '0 6px 18px rgba(2, 132, 199, 0.28)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
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
              lineHeight: 1.1,
              color: colors.text,
            }}
          >
            alltid<span style={{ color: colors.accent }}>itid</span>
            <span style={{ color: colors.textFaint, fontWeight: 700, fontSize: '15px' }}>.se</span>
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: colors.textDim,
              marginTop: '2px',
            }}
          >
            Avgångar och ankomster i realtid
          </span>
        </span>
      </a>

      <nav style={{ display: 'flex', gap: '16px', fontSize: '13px', fontWeight: 600 }}>
        <a href="#avgangstavla" style={navLink}>
          Tidtabell
        </a>
        <a href="#om-tjansten" style={navLink}>
          Om tjänsten
        </a>
        <a
          href="#sidfot"
          onClick={onContactClick}
          style={{ ...navLink, color: colors.accent }}
        >
          Kontakt
        </a>
      </nav>
    </header>
  );
}
