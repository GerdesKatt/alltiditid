import React from 'react';

/**
 * Tunna linjeikoner i samma stil som stjärnan, i stället för emojier.
 * Ärver textfärgen; alltid dekorativa (aria-hidden), texten bredvid bär betydelsen.
 */
const PATHS = {
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="M11 21l2-6-2.5-2.5L11 8l3 2 2 3M10.5 12.5L8 15M14 15l2 6" />
    </>
  ),
  train: (
    <>
      <rect x="6" y="3" width="12" height="13" rx="0" />
      <path d="M6 11h12M9 16l-2 4M15 16l2 4" />
      <circle cx="9" cy="13.5" r="0.6" />
      <circle cx="15" cy="13.5" r="0.6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 17.5v.5" />
    </>
  ),
} as const;

export default function Icon({ name, size = 16 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="square"
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: '-0.15em' }}
    >
      {PATHS[name]}
    </svg>
  );
}
