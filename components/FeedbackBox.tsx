'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../lib/i18n';
import { colors } from './styles';

type State = 'closed' | 'open' | 'sending' | 'sent' | 'error';

const MAX = 1000;
const DISMISS_KEY = 'alltiditid:tyck-till-stangd';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * "Tyck till": en smal rad som ligger fast längst ned (ovanför flikarna i mobilen) och fälls ut till en textruta. Synpunkten
 * sparas anonymt (action=feedback) och tas med i morgonkollen. Inget konto, ingen e-post.
 */
export default function FeedbackBox({ tab }: { tab: 'trafik' | 'resa' | 'flyg' }) {
  const { lang, t } = useLang();
  const [state, setState] = useState<State>('closed');
  const [text, setText] = useState('');
  const ready = text.trim().length >= 3 && text.length <= MAX;
  const boxRef = useRef<HTMLElement>(null);
  // Listen kan stängas med krysset. Då visas raden i stället sist på sidan, och listen kommer tillbaka efter en vecka.
  const [dismissed, setDismissed] = useState(true);
  const [tabbarH, setTabbarH] = useState(0);
  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
      setDismissed(Date.now() - at < DISMISS_MS);
    } catch {
      setDismissed(false);
    }
  }, []);
  // Listen ska ligga direkt mot flikmenyn i mobilen, så vi mäter menyns höjd i stället för att gissa.
  useEffect(() => {
    const bar = document.querySelector('.app-tabs');
    if (!bar) return;
    const measure = () => setTabbarH(getComputedStyle(bar).position === 'fixed' ? bar.getBoundingClientRect().height : 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  }
  const pinned = state === 'closed' && !dismissed;

  // Raden ligger fast i nederkant; formuläret öppnas på sin plats sist på sidan, så dit skrollar vi.
  function open() {
    setState('open');
    requestAnimationFrame(() => boxRef.current?.scrollIntoView({ block: 'center' }));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch('/api/trafik?action=feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), tab, lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setText('');
      setState('sent');
    } catch {
      setState('error');
    }
  }

  const button: React.CSSProperties = {
    minHeight: '44px',
    padding: '0 16px',
    borderRadius: 'var(--radius-control)',
    fontSize: '0.9375rem',
    fontWeight: 700,
    cursor: 'pointer',
  };

  return (
    <>
    {pinned && tabbarH ? <div aria-hidden="true" style={{ height: '48px' }} /> : null}
    <section
      ref={boxRef}
      aria-label={t('Tyck till', 'Give feedback')}
      className={pinned ? (tabbarH ? 'feedback-bar feedback-bar--fixed' : 'feedback-bar') : undefined}
      style={
        pinned
          ? { margin: '8px 0 0', padding: '4px 0', borderTop: `1px solid ${colors.border}`, backgroundColor: colors.bg, ...(tabbarH ? { bottom: `${tabbarH}px` } : {}) }
          : state === 'closed'
          ? { margin: '8px 0 24px', padding: '12px 0 0', borderTop: `1px solid ${colors.border}` }
          : { margin: '8px 0 24px', padding: '16px 0 0', borderTop: `1px solid ${colors.border}` }
      }
    >
      {state === 'sent' ? (
        <p role="status" style={{ margin: 0, fontSize: '0.9375rem', color: colors.text }}>
          {t('Tack! Vi läser allt som kommer in.', 'Thanks! We read everything that comes in.')}{' '}
          <button
            type="button"
            onClick={open}
            style={{ border: 'none', background: 'none', padding: 0, color: colors.accent, textDecoration: 'underline', font: 'inherit', cursor: 'pointer' }}
          >
            {t('Skriv en till', 'Write another')}
          </button>
        </p>
      ) : state === 'closed' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', color: colors.textDim }}>
            {t('Saknar du något, eller är något fel?', 'Missing something, or is something wrong?')}
          </span>
          <button
            type="button"
            onClick={open}
            style={{
              ...button,
              minHeight: '36px',
              padding: '0 12px',
              fontSize: '0.8125rem',
              flexShrink: 0,
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: colors.surface,
              color: colors.text,
            }}
          >
            {t('Tyck till', 'Give feedback')}
          </button>
          {pinned ? (
            <button
              type="button"
              onClick={dismiss}
              aria-label={t('Stäng', 'Close')}
              style={{ flexShrink: 0, width: '36px', height: '36px', marginLeft: '-6px', border: 'none', background: 'none', color: colors.textDim, fontSize: '1.25rem', lineHeight: 1, cursor: 'pointer', padding: 0 }}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={send}>
          <label htmlFor="tyck-till" style={{ display: 'block', fontSize: '0.9375rem', fontWeight: 700, marginBottom: '6px', color: colors.text }}>
            {t('Vad tycker du?', 'What do you think?')}
          </label>
          <textarea
            id="tyck-till"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            rows={4}
            autoFocus
            maxLength={MAX}
            placeholder={t('Till exempel: saknar spårvagnen i Lund, en funktion i appen, eller adressen hittas inte.', 'For example: the Lund tram is missing, a feature in the app, or an address is not found.')}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 'var(--radius-control)',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: colors.surface,
              color: colors.text,
              font: 'inherit',
              fontSize: '1rem',
              resize: 'vertical',
            }}
          />
          <p style={{ margin: '4px 0 10px', fontSize: '0.8125rem', color: colors.textDim }}>
            {t(
              'Skickas anonymt. Skriv inte namn eller kontaktuppgifter. Vill du ha svar, mejla kontakt@alltiditid.se.',
              'Sent anonymously. Do not include names or contact details. For a reply, email kontakt@alltiditid.se.'
            )}
          </p>
          {state === 'error' ? (
            <p role="alert" style={{ margin: '0 0 10px', fontSize: '0.875rem', color: colors.amber }}>
              {t('Det gick inte att skicka just nu. Försök igen om en stund.', 'Could not send right now. Try again in a moment.')}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="submit"
              disabled={!ready || state === 'sending'}
              style={{
                ...button,
                flex: 1,
                border: `1px solid ${colors.text}`,
                backgroundColor: colors.text,
                color: colors.bg,
                opacity: ready ? 1 : 0.5,
                cursor: ready ? 'pointer' : 'default',
              }}
            >
              {state === 'sending' ? t('Skickar…', 'Sending…') : t('Skicka', 'Send')}
            </button>
            <button
              type="button"
              onClick={() => setState('closed')}
              style={{ ...button, border: `1px solid ${colors.borderStrong}`, backgroundColor: 'transparent', color: colors.text }}
            >
              {t('Avbryt', 'Cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
    </>
  );
}
