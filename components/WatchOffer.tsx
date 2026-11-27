import React, { useEffect, useRef, useState } from 'react';
import { colors } from './styles';
import { useLang } from '../lib/i18n';
import { track } from '../lib/track';
import { loadWatchOffer, storeWatchOffer, type WatchPlan } from '../lib/watchOffer';

/**
 * Bevakning finns inte än. Det här är ett ärligt "fake door"-test: på Min resa-kortet
 * frågar vi om man vill bli varnad när resan påverkas, visar priset och samlar e-post
 * till en väntelista. Räknas med de egna kakfria händelserna (lib/track.ts):
 * visad, oppnad, pris_man, pris_ar, pris_gratis, anmald, stangd.
 */
export default function WatchOffer() {
  const { lang, t } = useLang();
  const [state, setState] = useState<'hidden' | 'closed' | 'open' | 'done'>('hidden');
  const [plan, setPlan] = useState<WatchPlan | null>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = loadWatchOffer();
    if (saved === 'dismissed' || saved === 'joined') return;
    setState('closed');
    track('bevakning', 0, 'visad');
  }, []);

  useEffect(() => {
    if (plan) inputRef.current?.focus();
  }, [plan]);

  if (state === 'hidden') return null;

  if (state === 'done') {
    return (
      <p role="status" style={{ margin: '14px 0 0', fontSize: '0.875rem', fontWeight: 600 }}>
        {t(
          'Tack! Du står i kön och får ett mejl när Bevakning kan provas.',
          "Thanks! You're on the list and will get an email when Watch can be tried."
        )}
      </p>
    );
  }

  if (state === 'closed') {
    return (
      <button
        type="button"
        onClick={() => {
          setState('open');
          track('bevakning', 0, 'oppnad');
        }}
        style={{ ...linkButton, marginTop: '10px', padding: 0 }}
      >
        <span aria-hidden="true">🔔 </span>
        {t('Säg till mig om min resa påverkas', 'Tell me if my trip is affected')}
      </button>
    );
  }

  const choose = (p: WatchPlan) => {
    setPlan(p);
    track('bevakning', 0, p === 'month' ? 'pris_man' : p === 'year' ? 'pris_ar' : 'pris_gratis');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || sending) return;
    setSending(true);
    setError(false);
    try {
      const res = await fetch('/api/trafik?action=waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), plan, lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      storeWatchOffer('joined');
      track('bevakning', 0, 'anmald');
      setState('done');
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  const choice = (p: WatchPlan, label: string) => (
    <button
      type="button"
      onClick={() => choose(p)}
      aria-pressed={plan === p}
      style={{
        minHeight: '44px',
        padding: '0 14px',
        border: `1px solid ${colors.text}`,
        background: plan === p ? colors.text : 'transparent',
        color: plan === p ? colors.bg : colors.text,
        fontSize: '0.875rem',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      role="group"
      aria-labelledby="watch-offer-title"
      style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${colors.text}` }}
    >
      <p id="watch-offer-title" style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700 }}>
        {t('Bevakning, snart', 'Watch, coming soon')}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: '0.875rem', lineHeight: 1.45 }}>
        {t(
          'Vi bygger en tjänst som håller koll på din resa och säger till i telefonen när den blir försenad eller inställd, innan du går hemifrån. Den finns inte än. Vad skulle du välja?',
          "We're building a service that keeps an eye on your trip and alerts your phone when it's delayed or cancelled, before you leave home. It doesn't exist yet. What would you choose?"
        )}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
        {choice('month', t('29 kr/mån', '29 SEK/month'))}
        {choice('year', t('249 kr/år', '249 SEK/year'))}
        {choice('free', t('Bara om den är gratis', 'Only if free'))}
      </div>

      {plan ? (
        <form onSubmit={submit} style={{ marginTop: '12px' }}>
          <label htmlFor="watch-offer-email" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600 }}>
            {t('Din e-post, så hör vi av oss när du kan prova', "Your email, and we'll let you know when you can try it")}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
            <input
              ref={inputRef}
              id="watch-offer-email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                flex: '1 1 12rem',
                minWidth: 0,
                minHeight: '44px',
                padding: '0 12px',
                border: `1px solid ${colors.text}`,
                background: colors.bg,
                color: colors.text,
                fontSize: '1rem',
              }}
            />
            <button
              type="submit"
              disabled={sending}
              style={{
                minHeight: '44px',
                padding: '0 16px',
                border: 'none',
                background: colors.text,
                color: colors.bg,
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: sending ? 'wait' : 'pointer',
              }}
            >
              {sending ? t('Skickar…', 'Sending…') : t('Ställ mig i kön', 'Join the list')}
            </button>
          </div>
          {error ? (
            <p role="alert" style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: colors.amber }}>
              {t('Det gick inte att spara just nu. Försök igen om en stund.', "Couldn't save right now. Please try again shortly.")}
            </p>
          ) : null}
          <p style={{ margin: '8px 0 0', fontSize: '0.75rem', lineHeight: 1.4, color: colors.textDim }}>
            {t(
              'Vi sparar bara e-posten och ditt val, och använder dem bara för att höra av oss om Bevakning. Mejla kontakt@alltiditid.se så raderar vi dem.',
              'We only store the email and your choice, and only use them to contact you about Watch. Email kontakt@alltiditid.se and we delete them.'
            )}
          </p>
        </form>
      ) : null}

      <button
        type="button"
        onClick={() => {
          storeWatchOffer('dismissed');
          track('bevakning', 0, 'stangd');
          setState('hidden');
        }}
        style={{ ...linkButton, marginTop: '6px', padding: 0, fontWeight: 500, color: colors.textDim }}
      >
        {t('Nej tack, visa inte igen', "No thanks, don't show again")}
      </button>
    </div>
  );
}

const linkButton: React.CSSProperties = {
  minHeight: '44px',
  border: 'none',
  background: 'none',
  color: colors.text,
  fontSize: '0.875rem',
  fontWeight: 600,
  textAlign: 'left',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
};
