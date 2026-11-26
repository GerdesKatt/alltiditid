import React from 'react';
import Icon from './Icon';
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
        title={t('Hinner jag dit? Visa gångtid till hållplatsen', 'Can I make it? Show walking time to the stop')}
        style={{
          minHeight: '44px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0 10px',
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
        <Icon name="walk" />
        {t('Gångtid', 'Walking time')}
      </button>
    );
  }

  // Redo eller letar: en kort rad i statusraden med takten som en liten väljare.
  if (state.kind === 'ready' || state.kind === 'locating') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', fontSize: '0.875rem', color: colors.text }}>
        <Icon name="walk" />
        <span role="status" style={{ fontWeight: 700 }}>
          {state.kind === 'ready'
            ? t(`${state.minutes} min gång`, `${state.minutes} min walk`)
            : t('Letar…', 'Locating…')}
        </span>
        <label>
          <span className="sr-only">{t('Gångtakt', 'Walking pace')}</span>
          <select
            value={pace}
            onChange={(e) => onPace(e.target.value as typeof pace)}
            style={{
              minHeight: '36px',
              padding: '0 6px',
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: 0,
              background: 'transparent',
              color: colors.text,
              fontSize: '0.8125rem',
              fontFamily: 'inherit',
            }}
          >
            {PACES.map((p) => (
              <option key={p.key} value={p.key}>
                {t(p.sv, p.en)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onTurnOff}
          aria-label={t('Stäng av gångtid', 'Turn off walking time')}
          style={{ minWidth: '32px', minHeight: '44px', padding: 0, border: 'none', background: 'none', color: colors.textDim, fontSize: '1rem', cursor: 'pointer' }}
        >
          ×
        </button>
      </span>
    );
  }

  // Långt bort: bara en kort text i statusraden, ingen ruta som trycker ner tavlan.
  if (state.kind === 'far') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', fontSize: '0.8125rem', color: colors.textDim }}>
        <Icon name="walk" />
        <span role="status">
          {t(`${decimal(state.meters / 1000, 1, lang)} km bort`, `${decimal(state.meters / 1000, 1, lang)} km away`)}
        </span>
        <button
          type="button"
          onClick={onTurnOff}
          aria-label={t('Stäng av gångtid', 'Turn off walking time')}
          style={{ minWidth: '32px', minHeight: '44px', padding: 0, border: 'none', background: 'none', color: colors.textDim, fontSize: '1rem', cursor: 'pointer' }}
        >
          ×
        </button>
      </span>
    );
  }

  // Kvar: platsåtkomst nekad eller fel. Här behövs en förklaring, så det blir en rad med text.
  const message =
    state.kind === 'denied'
      ? t(
          'Platsåtkomst är avstängd. Tillåt plats för alltiditid.se i webbläsaren för att se gångtid.',
          'Location access is off. Allow location for alltiditid.se in your browser to see walking time.'
        )
      : t('Din position gick inte att hitta just nu.', 'Your location could not be found right now.');

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
        <Icon name="walk" /> 
        {message}
      </span>
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
