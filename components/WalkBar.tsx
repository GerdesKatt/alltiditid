import React from 'react';
import { colors } from './styles';
import { decimal, useLang } from '../lib/i18n';
import type { WalkState } from '../lib/useWalk';
import type { WalkPace } from '../lib/walk.mjs';

type Props = {
  stopName: string;
  state: WalkState;
  pace: WalkPace;
  onTurnOn: () => void;
  onTurnOff: () => void;
  onPace: (pace: WalkPace) => void;
};

const PACES: { key: WalkPace; sv: string; en: string }[] = [
  { key: 'calm', sv: 'Lugn', en: 'Calm' },
  { key: 'normal', sv: 'Normal', en: 'Normal' },
  { key: 'brisk', sv: 'Rask', en: 'Brisk' },
];

const smallButton = {
  minHeight: '36px',
  padding: '0 10px',
  borderRadius: 'var(--radius-control)',
  border: `1px solid ${colors.borderStrong}`,
  backgroundColor: colors.surface,
  color: colors.text,
  fontFamily: 'inherit',
  fontSize: '0.8125rem',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

/**
 * Raden ovanför tavlan: slå på "Hinner jag dit?" och välj gångtakt.
 * När den är på får varje avgång beskedet Gå nu, Gå om X min eller Hinner inte.
 */
export default function WalkBar({ stopName, state, pace, onTurnOn, onTurnOff, onPace }: Props) {
  const { lang, t } = useLang();

  if (state.kind === 'off') {
    return (
      <button
        type="button"
        onClick={onTurnOn}
        style={{
          minHeight: '44px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '10px',
          padding: '0 12px 0 10px',
          borderRadius: 'var(--radius-control)',
          border: 'none',
          backgroundColor: 'transparent',
          color: colors.accent,
          fontFamily: 'inherit',
          fontWeight: 700,
          fontSize: '0.875rem',
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true">🚶</span>
        {t('Hinner jag dit? Visa gångtid', 'Can I make it? Show walking time')}
      </button>
    );
  }

  const message =
    state.kind === 'locating'
      ? t('Letar efter din position…', 'Finding your location…')
      : state.kind === 'denied'
      ? t(
          'Platsåtkomst är avstängd. Tillåt plats för alltiditid.se i webbläsaren för att se gångtid.',
          'Location access is off. Allow location for alltiditid.se in your browser to see walking time.'
        )
      : state.kind === 'error'
      ? t('Din position gick inte att hitta just nu.', 'Your location could not be found right now.')
      : state.kind === 'far'
      ? t(
          `Du är ${decimal(state.meters / 1000, 1, lang)} km från ${stopName}. Gångtid visas när du är närmare än 2,5 km.`,
          `You are ${decimal(state.meters / 1000, 1, lang)} km from ${stopName}. Walking time shows within 2.5 km.`
        )
      : t(`Gångtid till ${stopName}: ca ${state.minutes} min`, `Walking time to ${stopName}: about ${state.minutes} min`);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        flexBasis: '100%',
        boxSizing: 'border-box',
        marginBottom: '12px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-card)',
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
        fontSize: '0.875rem',
      }}
    >
      <span role="status" style={{ flex: '1 1 12rem', minWidth: 0, color: colors.text, fontWeight: 600 }}>
        <span aria-hidden="true">🚶 </span>
        {message}
      </span>
      {state.kind === 'ready' || state.kind === 'locating' ? (
        <span role="group" aria-label={t('Gångtakt', 'Walking pace')} style={{ display: 'inline-flex', gap: '4px' }}>
          {PACES.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={pace === p.key}
              onClick={() => onPace(p.key)}
              style={{
                ...smallButton,
                border: `1px solid ${pace === p.key ? colors.accentStrong : colors.borderStrong}`,
                backgroundColor: pace === p.key ? colors.accentStrong : colors.surface,
                color: pace === p.key ? colors.onAccent : colors.text,
              }}
            >
              {t(p.sv, p.en)}
            </button>
          ))}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onTurnOff}
        style={{ ...smallButton, marginLeft: 'auto', border: 'none', backgroundColor: 'transparent', color: colors.textDim }}
      >
        {t('Stäng av', 'Turn off')}
      </button>
    </div>
  );
}
