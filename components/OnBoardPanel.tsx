import React, { useEffect, useRef } from 'react';
import type { Departure, RiderMood } from '../lib/types';
import { colors, fonts } from './styles';
import { lineLabel, trackLabel, useLang } from '../lib/i18n';

type Props = {
  trip: Departure;
  stopName: string;
  riderStatus: RiderMood;
  onRiderStatusChange: (status: RiderMood) => void;
  riderNote: string;
  onRiderNoteChange: (note: string) => void;
  shareMessage: string;
  copied: boolean;
  onShare: () => void;
  onClose: () => void;
};

const RIDER_OPTIONS: { key: RiderMood; label: string; labelEn: string }[] = [
  { key: 'on-time', label: 'Jag är i tid', labelEn: "I'm on time" },
  { key: 'slightly-late', label: 'Lite sen', labelEn: 'A bit late' },
  { key: 'delayed', label: 'Försenad', labelEn: 'Delayed' },
];

export default function OnBoardPanel({
  trip,
  stopName,
  riderStatus,
  onRiderStatusChange,
  riderNote,
  onRiderNoteChange,
  shareMessage,
  copied,
  onShare,
  onClose,
}: Props) {
  const { lang, t } = useLang();
  const isArrival = trip.directionType === 'arrivals';
  const newTime = trip.newTime || trip.estimatedTime;
  const sheetRef = useRef<HTMLElement>(null);

  // Bladet får fokus när det öppnas (skärmläsare och tangentbord), och Esc stänger det.
  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
  }, [trip.id]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section
      id="resenar-lage"
      ref={sheetRef}
      className="onboard-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="resenar-lage-rubrik"
      tabIndex={-1}
      style={{
        padding: '18px',
        borderRadius: 0,
        outline: 'none',
        // Heltäckande bakgrund: tavlan får inte synas igenom bladet.
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        boxShadow: `0 -8px 28px ${colors.shadow}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>{t('Jag är ombord', "I'm on board")}</span>
          <h2
            id="resenar-lage-rubrik"
            style={{ fontFamily: fonts.display, fontSize: '1.25rem', fontWeight: 800, margin: '2px 0 0', color: colors.text, lineHeight: 1.2, fontVariantNumeric: 'normal' }}
          >
            {isArrival ? `${t('Ankomst', 'Arriving')} ${stopName}` : `${t('Mot', 'To')} ${trip.destination}`}{' '}
            {trip.scheduledTime}
            {trip.status === 'delayed' && newTime ? (
              <span style={{ color: colors.amber }}>
                {' '}
                → {newTime}
                {trip.delayMinutes ? ` (+${trip.delayMinutes})` : ''}
              </span>
            ) : null}
          </h2>
          <div style={{ fontSize: '0.8125rem', color: colors.textDim, marginTop: '4px' }}>
            {[
              `${t('Från', 'From')} ${isArrival ? trip.destination : stopName}`,
              lineLabel(trip.line, lang),
              trip.operator,
              trackLabel(trip.track, lang),
              trip.deviation,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            flexShrink: 0,
            minHeight: '44px',
            padding: '0 12px',
            borderRadius: 'var(--radius-control)',
            border: `1px solid ${colors.borderStrong}`,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: '0.8125rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('Stäng', 'Close')}
        </button>
      </div>

      {trip.gone ? (
        <p
          role="status"
          style={{
            margin: '0 0 12px 0',
            padding: '10px 12px',
            borderRadius: 0,
            border: `1px solid ${colors.delayedBorder}`,
            backgroundColor: colors.noticeBg,
            color: colors.noticeText,
            fontSize: '0.8125rem',
            lineHeight: 1.45,
          }}
        >
          {t(
            'Resan finns inte längre på tavlan, troligen för att den redan har gått. Tiderna nedan uppdateras inte längre.',
            'The trip is no longer on the board, probably because it has already left. The times below no longer update.'
          )}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        {RIDER_OPTIONS.map((opt) => {
          const active = riderStatus === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={active}
              onClick={() => onRiderStatusChange(opt.key)}
              style={{
                minHeight: '44px',
                padding: '0 14px',
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${active ? colors.accentStrong : colors.borderStrong}`,
                backgroundColor: active ? colors.accentStrong : colors.surface,
                color: active ? colors.onAccent : colors.text,
                fontSize: '0.8125rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t(opt.label, opt.labelEn)}
            </button>
          );
        })}
      </div>

      <label htmlFor="notis" className="sr-only">
        {t('Notis till den som hämtar', 'Note for whoever is picking you up')}
      </label>
      <input
        id="notis"
        type="text"
        value={riderNote}
        onChange={(e) => onRiderNoteChange(e.target.value)}
        placeholder={t('Notis, t.ex. Sitter i främre vagnen', "Note, e.g. I'm in the front carriage")}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          minHeight: '48px',
          padding: '0 14px',
          borderRadius: 'var(--radius-control)',
          border: `1px solid ${colors.borderStrong}`,
          backgroundColor: colors.surface,
          color: colors.text,
          fontSize: '1rem',
          marginBottom: '12px',
        }}
      />

      <div
        style={{
          padding: '12px 14px',
          borderRadius: 'var(--radius-control)',
          backgroundColor: colors.surfaceRaised,
          border: 'none',
          fontSize: '0.9375rem',
          color: colors.text,
          marginBottom: '12px',
          lineHeight: 1.5,
        }}
      >
        <strong
          style={{
            color: colors.textDim,
            display: 'block',
            fontSize: '0.8125rem',
            fontWeight: 600,
            marginBottom: '4px',
          }}
        >
          {t('Meddelandet som skickas', 'The message that will be sent')}
        </strong>
        {shareMessage}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onShare}
          style={{
            minHeight: '52px',
            padding: '0 18px',
            borderRadius: 'var(--radius-card)',
            border: 'none',
            backgroundColor: colors.accentStrong,
            color: colors.onAccent,
            fontWeight: 700,
            fontSize: '0.9375rem',
            cursor: 'pointer',
          }}
        >
          {t('Skicka till den som hämtar', 'Send to whoever is picking you up')}
        </button>

        {copied ? (
          <span role="status" style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>
            {t('Meddelandet är kopierat.', 'Message copied.')}
          </span>
        ) : null}
      </div>
    </section>
  );
}
