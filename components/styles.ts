import type { CSSProperties } from 'react';

/**
 * Färgpalett. Varje färg är en CSS-variabel (app/globals.css) med ett mörkt och ett
 * ljust värde, så att samma inline-stilar fungerar i båda teman.
 */
export const colors = {
  /** Sidans bakgrund */
  bg: 'var(--c-bg)',
  /** Kort, fält, knappar */
  surface: 'var(--c-surface)',
  /** Upphöjda knappar */
  surfaceRaised: 'var(--c-surface-raised)',
  /** Dekorativa ramar */
  border: 'var(--c-border)',
  /** Ram på knappar och fält, minst 3:1 */
  borderStrong: 'var(--c-border-strong)',
  /** Ram på sekundära knappar */
  borderMuted: 'var(--c-border-muted)',
  /** Brödtext */
  text: 'var(--c-text)',
  textSoft: 'var(--c-text-soft)',
  textMuted: 'var(--c-text-muted)',
  textDim: 'var(--c-text-dim)',
  /** Minst 4,5:1 mot kort och sida */
  textFaint: 'var(--c-text-faint)',
  /** Länkar och markeringar */
  accent: 'var(--c-accent)',
  accentSoft: 'var(--c-accent-soft)',
  /** Bakgrund bakom vit text, 5,7:1 */
  accentStrong: 'var(--c-accent-strong)',
  /** Svag blå bakgrund (vald region, nära mig) */
  accentTint: 'var(--c-accent-tint)',
  /** Ramar för ankomster/vald hållplats */
  green: 'var(--c-green)',
  /** Grön text */
  greenSoft: 'var(--c-green-soft)',
  /** Svag grön bakgrund (vald hållplats) */
  greenTint: 'var(--c-green-tint)',
  /** Varningstext */
  amber: 'var(--c-amber)',
  /** Text på accentStrong/arrivalsBg */
  onAccent: 'var(--c-on-accent)',
  /** Vald Ankomster-knapp, vit text 5,2:1 */
  arrivalsBg: 'var(--c-arrivals-bg)',
  headerBg: 'var(--c-header-bg)',
  /** Sökpanelens gradient, överst */
  panelTop: 'var(--c-panel-top)',
  /** Sökpanelens gradient, nederst */
  panelBottom: 'var(--c-panel-bottom)',
  /** Ovald hållplatsknapp */
  chipBg: 'var(--c-chip-bg)',
  /** Vald resa i tavlan */
  selectedRowBg: 'var(--c-selected-row-bg)',
  /** Ombordpanelens gradient, överst */
  onboardTop: 'var(--c-onboard-top)',
  /** Ombordpanelens gradient, nederst */
  onboardBottom: 'var(--c-onboard-bottom)',
  /** Ruta med statusmeddelandet */
  messageBg: 'var(--c-message-bg)',
  /** Byt hållplats-knappen */
  switchBg: 'var(--c-switch-bg)',
  /** Text på Byt hållplats-knappen */
  switchText: 'var(--c-switch-text)',
  /** Skuggor */
  shadow: 'var(--c-shadow)',
  /** Märke: i tid / realtid */
  okBg: 'var(--c-ok-bg)',
  okBorder: 'var(--c-ok-border)',
  okText: 'var(--c-ok-text)',
  /** Märke: försenad / begränsad */
  delayedBg: 'var(--c-delayed-bg)',
  delayedBorder: 'var(--c-delayed-border)',
  delayedText: 'var(--c-delayed-text)',
  /** Märke: inställd */
  cancelledBg: 'var(--c-cancelled-bg)',
  cancelledBorder: 'var(--c-cancelled-border)',
  cancelledText: 'var(--c-cancelled-text)',
  /** Märke: enligt tidtabell */
  scheduledBg: 'var(--c-scheduled-bg)',
  scheduledBorder: 'var(--c-scheduled-border)',
  scheduledText: 'var(--c-scheduled-text)',
  /** Felruta */
  errorBg: 'var(--c-error-bg)',
  errorText: 'var(--c-error-text)',
  /** Varningsruta (resan försvunnen) */
  noticeBg: 'var(--c-notice-bg)',
  noticeText: 'var(--c-notice-text)',
  /** Linjebricka: bläck med ljus text */
  badgeBg: 'var(--c-badge-bg)',
  badgeText: 'var(--c-badge-text)',
  /** Varumärket: hallon. Bara för logga och realtid. */
  brand: 'var(--brand)',
} as const;

/** Typsnitt (brand guiden, avsnitt Typografi). */
export const fonts = {
  display: 'var(--font-display)',
  text: 'var(--font-text)',
} as const;

/** Textfält (stationssök, filter). */
export function textInput(borderColor: string): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 14px',
    borderRadius: '11px',
    border: `1px solid ${borderColor}`,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: '0.8125rem',
  };
}

/** Ruta för "laddar" och "inga träffar". */
export const emptyState: CSSProperties = {
  padding: '28px',
  textAlign: 'center',
  borderRadius: '14px',
  backgroundColor: colors.surface,
  border: `1px solid ${colors.border}`,
  color: colors.textDim,
};
