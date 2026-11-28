'use client';
import React, { useEffect, useState } from 'react';
import { colors, fonts } from './styles';
import { useLang } from '../lib/i18n';
import { track } from '../lib/track';

/** Chrome/Android: webbläsarens egen installationsfråga, sparad tills man trycker. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const VISITS_KEY = 'alltiditid:besok';
const DISMISS_KEY = 'alltiditid:hemskarm-nej';

/**
 * "Lägg på hemskärmen": öppnas som en app, och i Safari raderas inget sparat efter 7 dagar.
 * Android och Chrome får en riktig installationsknapp. iPhone har ingen sådan, där visas de två stegen.
 * Syns inte när sajten redan är öppnad från hemskärmen, eller när man har tackat nej.
 */
export default function InstallApp({ where = 'hem' }: { where?: 'hem' | 'tavla' }) {
  const { t } = useLang();
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      // Ett × gömmer knappen i två veckor, inte för alltid.
      const at = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
      dismissed = at > 1 && Date.now() - at < 14 * 86_400_000;
    } catch {
      dismissed = false;
    }
    // Från andra besöket (olika dagar): den som är ny ska se avgångar, inte en uppmaning.
    // Den som kommer tillbaka en andra dag är den som har nytta av appen på hemskärmen (tillväxtplanen, ändring 2).
    let visits = 0;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = JSON.parse(window.localStorage.getItem(VISITS_KEY) || '{}') as { n?: number; last?: string };
      visits = raw.n || 0;
      if (raw.last !== today) {
        visits += 1;
        window.localStorage.setItem(VISITS_KEY, JSON.stringify({ n: visits, last: today }));
      }
    } catch {
      visits = 0;
    }
    if (standalone || dismissed || visits < 2) return;
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    setIos(isIos);
    if (isIos) setVisible(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      track('nyckel', 0, 'hemskarm_lagd');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Ingen lagring: frågan kommer tillbaka nästa gång.
    }
  }

  async function install() {
    track('funktion', 0, where === 'tavla' ? 'hemskarm_tavla' : 'hemskarm');
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setVisible(false);
      setPrompt(null);
      return;
    }
    setShowSteps((v) => !v);
  }

  return (
    <section
      aria-label={t('Lägg på hemskärmen', 'Add to home screen')}
      style={{ marginBottom: '22px', paddingTop: '12px', borderTop: `1px solid ${colors.border}` }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          onClick={install}
          aria-expanded={ios ? showSteps : undefined}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            minHeight: '56px',
            padding: '8px 14px 8px 8px',
            border: `1px solid ${colors.text}`,
            background: 'transparent',
            color: colors.text,
            fontSize: 'var(--fs-3)',
            fontWeight: 700,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          {/* Appens egen ikon och ordmärket: det ska synas att det är just den här appen. */}
          <img src="/icon-192-v6.png" alt="" width={40} height={40} style={{ flexShrink: 0, display: 'block' }} />
          <span>
            {t('Lägg', 'Add')}{' '}
            <span style={{ fontFamily: fonts.display, fontWeight: 800, letterSpacing: '-0.015em', fontSize: 'var(--fs-4)' }}>alltid i tid</span>{' '}
            {t('på hemskärmen', 'to your home screen')}
          </span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('Inte nu', 'Not now')}
          style={{ minWidth: '44px', minHeight: '48px', border: 'none', background: 'none', color: colors.textDim, fontSize: 'var(--fs-5)', cursor: 'pointer' }}
        >
          ×
        </button>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-2)', color: colors.textDim }}>
        {t(
          'Öppnas som en app, och det du sparat ligger kvar.',
          'Opens like an app, and what you saved stays put.'
        )}
      </p>
      {ios && showSteps ? (
        <ol style={{ margin: '10px 0 0', paddingLeft: '1.25rem', fontSize: 'var(--fs-3)', lineHeight: 1.6 }}>
          <li>
            {t('Tryck på', 'Tap')}{' '}
            <strong>
              {t('Dela', 'Share')}{' '}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
                <path d="M12 3v13M7 8l5-5 5 5M5 12v8h14v-8" />
              </svg>
            </strong>{' '}
            {t('i Safari (längst ned, eller bredvid adressen).', 'in Safari (at the bottom, or next to the address).')}
          </li>
          <li>
            {t('Välj', 'Choose')} <strong>{t('Lägg till på hemskärmen', 'Add to Home Screen')}</strong>
            {t(' och sedan Lägg till.', ', then Add.')}
          </li>
        </ol>
      ) : null}
    </section>
  );
}
