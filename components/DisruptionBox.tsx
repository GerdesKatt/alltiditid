import React, { useEffect, useState } from 'react';
import type { Disruption } from '../lib/types';
import Icon from './Icon';
import { colors } from './styles';
import { lineLabel, useLang, type Lang } from '../lib/i18n';

type Props = {
  disruptions: Disruption[];
};

/** "Gröna linjen 17", "Gröna linjen 19", "Buss 4" → "Gröna linjen 17, 19 · Buss 4". */
export function formatLines(lines: string[], lang: Lang = 'sv'): string {
  const groups = new Map<string, string[]>();
  const order: string[] = [];
  for (const line of lines) {
    const m = /^(.*\S)\s+(\S+)$/.exec(line.trim());
    const name = m ? m[1] : line;
    const designation = m ? m[2] : '';
    if (!groups.has(name)) {
      groups.set(name, []);
      order.push(name);
    }
    if (designation) groups.get(name)!.push(designation);
  }
  return order.map((name) => `${lineLabel(name, lang)} ${groups.get(name)!.join(', ')}`.trim()).join(' · ');
}

/**
 * Störningar som en enda rad överst på tavlan: "⚠ 3 störningar · Pendeltåg 41".
 * Raden tar inte plats från avgångarna; ett tryck visar texterna.
 */
const linkButton = {
  alignSelf: 'flex-start',
  minHeight: '44px',
  padding: '0 8px',
  border: 'none',
  background: 'none',
  color: colors.delayedText,
  fontSize: '0.8125rem',
  fontWeight: 700,
  cursor: 'pointer',
  textDecoration: 'underline',
} as const;

/** Störningar man har dolt, per text. Gäller i dagens session; en ny text syns igen. */
const DISMISSED_KEY = 'alltiditid:dolda-storningar';

function loadDismissed(): string[] {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(DISMISSED_KEY) || '[]');
    return Array.isArray(v) ? v.map(String).slice(-50) : [];
  } catch {
    return [];
  }
}

export default function DisruptionBox({ disruptions }: Props) {
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(loadDismissed()), []);
  const active = disruptions.filter((d) => !dismissed.includes(d.text));

  function dismiss(text: string) {
    const next = [...dismissed, text];
    setDismissed(next);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Gäller tills sidan laddas om.
    }
  }
  function restore() {
    setDismissed([]);
    try {
      window.sessionStorage.removeItem(DISMISSED_KEY);
    } catch {
      // Ingen lagring.
    }
  }

  if (active.length === 0) {
    return dismissed.length && disruptions.length ? (
      <button type="button" onClick={restore} style={linkButton}>
        {t(
          `Visa ${disruptions.length} ${disruptions.length === 1 ? 'dold störning' : 'dolda störningar'}`,
          `Show ${disruptions.length} hidden ${disruptions.length === 1 ? 'disruption' : 'disruptions'}`
        )}
      </button>
    ) : null;
  }

  // Alla berörda linjer, utan dubbletter, i den ordning störningarna kommer.
  // Linjerna bara när de är få; annars bara antalet, så att raden inte blir en uppräkning.
  const lineSet = Array.from(new Set(active.flatMap((d) => d.lines)));
  const allLines = lineSet.length <= 3 ? formatLines(lineSet, lang) : '';
  const count = `${active.length} ${
    active.length === 1 ? t('störning', 'disruption') : t('störningar', 'disruptions')
  }`;

  return (
    <section
      aria-label={t('Störningar', 'Disruptions')}
      style={{
        marginBottom: '10px',
        borderRadius: 0,
        // En rad med en signalkant, ingen orange ruta.
        borderLeft: `3px solid ${colors.delayedBorder}`,
        backgroundColor: 'transparent',
        color: colors.text,
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          minHeight: '44px',
          padding: '8px 12px',
          border: 'none',
          background: 'none',
          color: colors.delayedText,
          fontSize: '0.875rem',
          fontWeight: 700,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <Icon name="alert" size={15} /> {count}
          {allLines ? ` · ${allLines}` : ''}
        </span>
        <span style={{ flexShrink: 0, textDecoration: 'underline' }}>{open ? t('Dölj', 'Hide') : t('Visa', 'Show')}</span>
      </button>
      {open ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: '0 12px 4px' }}>
          {active.map((d) => (
            <li key={d.text} style={{ padding: '8px 0 0', borderTop: `1px solid ${colors.delayedBorder}` }}>
              <strong style={{ display: 'block', fontSize: '0.875rem', color: colors.delayedText }}>
                {formatLines(d.lines, lang)}
              </strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.875rem', lineHeight: 1.5, color: colors.textSoft }}>{d.text}</p>
              {d.from ? (
                // Texten är trafikbolagets egen ("vår trygghetscentral" är SL:s), så avsändaren står under.
                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: colors.textSoft }}>
                  {t(`Meddelande från ${d.from}`, `Message from ${d.from}`)}
                </p>
              ) : null}
              <button type="button" onClick={() => dismiss(d.text)} style={{ ...linkButton, padding: 0 }}>
                {t('Visa inte den här igen', "Don't show this again")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
