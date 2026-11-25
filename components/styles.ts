import type { CSSProperties } from 'react';

/** Färgpalett som används i hela appen. */
export const colors = {
  bg: '#020617',
  surface: '#0f172a',
  surfaceRaised: '#1e293b',
  border: '#1e293b',
  borderStrong: '#334155',
  borderMuted: '#475569',
  text: '#f8fafc',
  textSoft: '#e2e8f0',
  textMuted: '#cbd5e1',
  textDim: '#94a3b8',
  textFaint: '#64748b',
  accent: '#38bdf8',
  accentSoft: '#7dd3fc',
  accentStrong: '#0284c7',
  green: '#10b981',
  greenSoft: '#6ee7b7',
  amber: '#fbbf24',
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
    fontSize: '13px',
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
