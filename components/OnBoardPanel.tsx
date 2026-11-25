import React, { useEffect, useRef } from 'react';
import type { Departure, RiderMood } from '../lib/types';
import { colors } from './styles';

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

const RIDER_OPTIONS: { key: RiderMood; label: string }[] = [
  { key: 'on-time', label: 'Jag är i tid' },
  { key: 'slightly-late', label: 'Lite sen' },
  { key: 'delayed', label: 'Försenad' },
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
        borderRadius: '18px 18px 0 0',
        outline: 'none',
        background:
          `linear-gradient(135deg, ${colors.onboardTop} 0%, ${colors.onboardBottom} 100%)`,
        border: `1px solid ${colors.accent}`,
        boxShadow: `0 12px 28px ${colors.shadow}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: colors.accentSoft,
            }}
          >
            Jag är ombord
          </span>
          <h2
            id="resenar-lage-rubrik"
            style={{
              fontSize: '19px',
              fontWeight: 800,
              margin: '4px 0 0 0',
              color: colors.text,
            }}
          >
            {isArrival ? `Ankomst ${stopName}` : trip.destination}{' '}
            (Ord. {trip.scheduledTime}
            {trip.status === 'delayed' && newTime
              ? ` • Ny tid ${newTime}${trip.delayMinutes ? ` (+${trip.delayMinutes} min)` : ''}`
              : ''}
            )
          </h2>
          <div style={{ fontSize: '13px', color: colors.textMuted, marginTop: '2px' }}>
            {isArrival ? `Från ${trip.destination}` : `Från ${stopName}`}{' '}
            | {trip.line} | {trip.operator}
            {trip.track ? ` | ${trip.track}` : ''}
            {trip.deviation ? ` | ${trip.deviation}` : ''}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            border: `1px solid ${colors.borderMuted}`,
            backgroundColor: colors.surface,
            color: colors.textMuted,
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Avsluta läge
        </button>
      </div>

      {trip.gone ? (
        <p
          role="status"
          style={{
            margin: '0 0 12px 0',
            padding: '10px 12px',
            borderRadius: '10px',
            border: `1px solid ${colors.delayedBorder}`,
            backgroundColor: colors.noticeBg,
            color: colors.noticeText,
            fontSize: '13px',
            lineHeight: 1.45,
          }}
        >
          Resan finns inte längre på tavlan, troligen för att den redan har gått. Tiderna nedan
          uppdateras inte längre.
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
                padding: '8px 14px',
                borderRadius: '10px',
                border: active ? `1px solid ${colors.accent}` : `1px solid ${colors.borderStrong}`,
                backgroundColor: active ? colors.accentStrong : colors.surface,
                color: active ? colors.onAccent : colors.text,
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <label htmlFor="notis" className="sr-only">
        Notis till den som hämtar
      </label>
      <input
        id="notis"
        type="text"
        value={riderNote}
        onChange={(e) => onRiderNoteChange(e.target.value)}
        placeholder="Valfri notis till den som hämtar (t.ex. Sitter i främre vagnen)..."
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 14px',
          borderRadius: '10px',
          border: `1px solid ${colors.borderStrong}`,
          backgroundColor: colors.surface,
          color: colors.text,
          fontSize: '13px',
          marginBottom: '12px',
        }}
      />

      <div
        style={{
          padding: '11px 14px',
          borderRadius: '10px',
          backgroundColor: colors.messageBg,
          border: `1px solid ${colors.border}`,
          fontSize: '13px',
          color: colors.textSoft,
          marginBottom: '12px',
          lineHeight: 1.5,
        }}
      >
        <strong
          style={{
            color: colors.textDim,
            display: 'block',
            fontSize: '11px',
            marginBottom: '4px',
          }}
        >
          Färdigt statusmeddelande:
        </strong>
        {shareMessage}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onShare}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: 'none',
            // Fast grön med mörk text: samma i mörkt och ljust tema (7,9:1).
            backgroundColor: '#10b981',
            color: '#062e22',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Skicka / kopiera status till den som hämtar
        </button>

        {copied ? (
          <span style={{ fontSize: '13px', fontWeight: 700, color: colors.greenSoft }}>
            Meddelandet är kopierat!
          </span>
        ) : null}
      </div>
    </section>
  );
}
