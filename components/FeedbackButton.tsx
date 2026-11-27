'use client';
import React, { useEffect, useRef, useState } from 'react';
import { colors } from './styles';
import { useLang } from '../lib/i18n';
import SheetBackdrop from './SheetBackdrop';

const MAX = 1000;

type Status = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Tyck till: en liten pratbubbla i sidhuvudet (och en textlänk i sidfoten) som öppnar
 * ett blad med ett fritextfält. Inget konto, ingen e-post. Texten, sidan och språket
 * sparas i D1 (functions/api/trafik.js, action=feedback) och läses i morgonkollen.
 */
export default function FeedbackButton({ variant = 'icon' }: { variant?: 'icon' | 'link' }) {
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    if (status === 'sent') {
      setText('');
      setStatus('idle');
    }
    opener.current?.focus();
  }

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (text.trim().length < 2 || status === 'sending') return;
    setStatus('sending');
    setError('');
    const webb = (e.currentTarget.elements.namedItem('webb') as HTMLInputElement | null)?.value || '';
    try {
      const res = await fetch('/api/trafik?action=feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, MAX), page: window.location.pathname + window.location.hash, lang, webb }),
      });
      if (res.status === 204) {
        setStatus('sent');
        return;
      }
      setStatus('error');
      setError(
        res.status === 429
          ? t('Många synpunkter i dag. Försök igen i morgon.', 'Lots of feedback today. Please try again tomorrow.')
          : t('Det gick inte att skicka. Försök igen om en stund.', 'Could not send. Please try again in a moment.')
      );
    } catch {
      setStatus('error');
      setError(t('Ingen kontakt med servern. Försök igen.', 'No connection to the server. Please try again.'));
    }
  }

  const label = t('Tyck till', 'Feedback');

  const trigger =
    variant === 'icon' ? (
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('Tyck till om sajten', 'Give feedback on the site')}
        aria-haspopup="dialog"
        title={label}
        className="feedback-trigger"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          minWidth: '44px',
          height: '44px',
          padding: '0 4px',
          border: 'none',
          background: 'none',
          color: colors.textMuted,
          font: 'inherit',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        <span className="feedback-trigger-text">{label}</span>
      </button>
    ) : (
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: '44px',
          padding: 0,
          border: 'none',
          background: 'none',
          color: colors.textDim,
          font: 'inherit',
          fontSize: '0.8125rem',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        {t('Tyck till om sajten', 'Give feedback')}
      </button>
    );

  return (
    <>
      {trigger}
      {open ? (
        <>
          <SheetBackdrop onClose={close} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tyck-till-rubrik"
            className="onboard-sheet feedback-sheet"
            style={{
              backgroundColor: colors.surface,
              color: colors.text,
              borderTop: `1px solid ${colors.borderStrong}`,
              borderRadius: '16px 16px 0 0',
              padding: '18px 16px',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <h2 id="tyck-till-rubrik" style={{ margin: 0, fontSize: '1.125rem' }}>
                {t('Tyck till', 'Feedback')}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={t('Stäng', 'Close')}
                style={{ width: '44px', height: '44px', marginRight: '-10px', border: 'none', background: 'none', color: colors.text, fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {status === 'sent' ? (
              <div aria-live="polite">
                <p style={{ margin: '8px 0 16px', lineHeight: 1.5 }}>
                  {t('Tack! Vi läser allt som kommer in.', 'Thank you! We read everything that comes in.')}
                </p>
                <button type="button" onClick={close} style={primaryButton}>
                  {t('Klar', 'Done')}
                </button>
              </div>
            ) : (
              <form onSubmit={send}>
                <p style={{ margin: '4px 0 12px', color: colors.textMuted, fontSize: '0.875rem', lineHeight: 1.5 }}>
                  {t(
                    'Något som saknas, krånglar eller är fel? Skriv fritt. Inget konto behövs.',
                    'Something missing, confusing or wrong? Write freely. No account needed.'
                  )}
                </p>
                <label htmlFor="tyck-till-text" style={{ position: 'absolute', left: '-9999px' }}>
                  {t('Din synpunkt', 'Your feedback')}
                </label>
                <textarea
                  id="tyck-till-text"
                  ref={field}
                  value={text}
                  maxLength={MAX}
                  rows={5}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('Till exempel: hållplatsen jag söker finns inte', 'For example: the stop I look for is missing')}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    border: `1px solid ${colors.borderStrong}`,
                    borderRadius: '10px',
                    backgroundColor: colors.bg,
                    color: colors.text,
                    font: 'inherit',
                    fontSize: '1rem',
                    lineHeight: 1.4,
                    resize: 'vertical',
                  }}
                />
                {/* Fälla för robotar: dold för människor och skärmläsare. */}
                <input type="text" name="webb" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }} />
                <p style={{ margin: '6px 0 12px', color: colors.textFaint, fontSize: '0.75rem', lineHeight: 1.5 }}>
                  {t(
                    'Skriv inte namn, telefonnummer eller annat om dig. Vill du ha svar, mejla kontakt@alltiditid.se. ',
                    'Please leave out your name, phone number or other details about you. For a reply, email kontakt@alltiditid.se. '
                  )}
                  {text.length > MAX - 100 ? `${text.length}/${MAX}` : null}
                </p>
                {error ? (
                  <p role="alert" style={{ margin: '0 0 12px', color: colors.text, fontWeight: 600, fontSize: '0.875rem' }}>
                    {error}
                  </p>
                ) : null}
                <button type="submit" disabled={text.trim().length < 2 || status === 'sending'} style={{ ...primaryButton, opacity: text.trim().length < 2 ? 0.5 : 1 }}>
                  {status === 'sending' ? t('Skickar…', 'Sending…') : t('Skicka', 'Send')}
                </button>
              </form>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}

const primaryButton = {
  width: '100%',
  minHeight: '48px',
  border: 'none',
  borderRadius: '10px',
  backgroundColor: colors.text,
  color: colors.bg,
  font: 'inherit',
  fontSize: '1rem',
  fontWeight: 700,
  cursor: 'pointer',
} as const;
