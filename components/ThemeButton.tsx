'use client';
import React, { useEffect, useState } from 'react';
import { colors } from './styles';
import { useLang } from '../lib/i18n';
import { applyTheme, loadTheme, type ThemeChoice } from '../lib/theme';

const NEXT: Record<ThemeChoice, ThemeChoice> = { auto: 'light', light: 'dark', dark: 'auto' };

/** Ljus, mörk eller som telefonen. Ett tryck byter i den ordningen; symbolen visar vad som gäller. */
export default function ThemeButton() {
  const { t } = useLang();
  const [choice, setChoice] = useState<ThemeChoice>('auto');
  useEffect(() => setChoice(loadTheme()), []);

  const now = { auto: t('som telefonen', 'like your phone'), light: t('ljus', 'light'), dark: t('mörk', 'dark') };
  const label = t(`Skärm: ${now[choice]}. Byt till ${now[NEXT[choice]]}`, `Screen: ${now[choice]}. Switch to ${now[NEXT[choice]]}`);

  return (
    <button
      type="button"
      onClick={() => {
        const next = NEXT[choice];
        setChoice(next);
        applyTheme(next);
      }}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        // 44 × 44: Apples minsta tryckyta.
        width: '44px',
        height: '44px',
        marginRight: '-6px',
        border: 'none',
        background: 'none',
        color: colors.text,
        cursor: 'pointer',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {choice === 'light' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
          </>
        ) : choice === 'dark' ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
          </>
        )}
      </svg>
    </button>
  );
}
