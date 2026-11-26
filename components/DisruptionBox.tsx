import React, { useEffect, useState } from 'react';
import type { Disruption } from '../lib/types';
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
 * A4/C3: störningar en gång per linje, överst på tavlan, i stället för samma gula text
 * på var tredje rad. Ihopfällda till två rader; ett tryck visar hela texten.
 */
/** Så många rutor syns direkt; resten bakom "Visa N störningar till". */
const VISIBLE = 1;

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
  const [showAll, setShowAll] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(loadDismissed()), []);
  const active = disruptions.filter((d) => !dismissed.includes(d.text));
  if (active.length === 0) {
    return dismissed.length && disruptions.length ? (
      <button type="button" onClick={() => restore()} style={linkButton}>
        {t(
          `Visa ${disruptions.length} dolda ${disruptions.length === 1 ? 'störning' : 'störningar'}`,
          `Show ${disruptions.length} hidden ${disruptions.length === 1 ? 'disruption' : 'disruptions'}`
        )}
      </button>
    ) : null;
  }
  const shown = showAll ? active : active.slice(0, VISIBLE);
  const hidden = active.length - shown.length;

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
  return (
    <section aria-label={t('Störningar', 'Disruptions')} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
      {shown.map((d) => (
        <details
          key={d.text}
          style={{
            borderRadius: '11px',
            border: `1px solid ${colors.delayedBorder}`,
            backgroundColor: colors.delayedBg,
            color: colors.text,
          }}
        >
          <summary
            className="disruption-summary"
            style={{
              cursor: 'pointer',
              padding: '10px 12px',
              minHeight: '44px',
              boxSizing: 'border-box',
              fontSize: '0.8125rem',
              lineHeight: 1.4,
              listStyle: 'none',
            }}
          >
            <strong style={{ color: colors.delayedText }}>
              <span aria-hidden="true">⚠ </span>
              {formatLines(d.lines, lang)}
            </strong>
            <span className="disruption-teaser" style={{ display: 'block', color: colors.textSoft }}>
              {d.text}
            </span>
          </summary>
          <p style={{ margin: 0, padding: '0 12px 4px', fontSize: '0.8125rem', lineHeight: 1.5, color: colors.textSoft }}>
            {d.text}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', padding: '0 4px 4px' }}>
            <button
              type="button"
              onClick={(e) => {
                const box = (e.currentTarget.closest('details') as HTMLDetailsElement | null);
                if (box) box.open = false;
              }}
              style={linkButton}
            >
              {t('Fäll ihop', 'Collapse')}
            </button>
            <button type="button" onClick={() => dismiss(d.text)} style={linkButton}>
              {t('Dölj störningen', 'Hide disruption')}
            </button>
          </div>
        </details>
      ))}
      {showAll && active.length > VISIBLE ? (
        <button type="button" onClick={() => setShowAll(false)} style={linkButton}>
          {t('Visa färre störningar', 'Show fewer disruptions')}
        </button>
      ) : null}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{
            alignSelf: 'flex-start',
            minHeight: '44px',
            padding: '0 4px',
            border: 'none',
            background: 'none',
            color: colors.delayedText,
            fontSize: '0.8125rem',
            fontWeight: 700,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {t(
            `Visa ${hidden} ${hidden === 1 ? 'störning' : 'störningar'} till`,
            `Show ${hidden} more ${hidden === 1 ? 'disruption' : 'disruptions'}`
          )}
        </button>
      ) : null}
    </section>
  );
}
