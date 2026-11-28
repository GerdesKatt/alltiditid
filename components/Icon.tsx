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
  bus: (
    <>
      <rect x="5" y="3.5" width="14" height="14" rx="2" />
      <path d="M5 11h14M8.5 20.5v-3M15.5 20.5v-3" />
      <circle cx="8.5" cy="14.3" r="0.6" />
      <circle cx="15.5" cy="14.3" r="0.6" />
    </>
  ),
  car: (
    <>
      <path d="M4 16v-4l2.5-5h11L20 12v4z" />
      <path d="M4 12h16M7 16v2.5M17 16v2.5" />
      <circle cx="7.5" cy="13.8" r="0.6" />
      <circle cx="16.5" cy="13.8" r="0.6" />
    </>
  ),
  bike: (
    <>
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16l4-7h6l2 7M10 9l3 7h-7M9 6h3" />
    </>
  ),
  book: (
    <>
      <path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z" />
      <path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 17.5v.5" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  star: <path d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" strokeLinejoin="miter" />,
} as const;

/**
 * Stjärnan för Spara, ritad i samma linjetjocklek som övriga ikoner (inte tecknet ☆ i Arial).
 * Sparad fylls den med rosé och studsar en gång (.star-pop, av vid "minska rörelse").
 */
export function StarIcon({ filled, size = 20 }: { filled: boolean; size?: number }) {
  // Studsen bara när man själv sparar, inte när sidan öppnas med en redan sparad stjärna.
  const initial = React.useRef(filled);
  const pop = filled && !initial.current;
  return (
    <svg
      key={filled ? 'on' : 'off'}
      className={pop ? 'star-pop' : undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'var(--rose)' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="miter"
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: '-0.15em' }}
    >
      {PATHS.star}
    </svg>
  );
}

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
