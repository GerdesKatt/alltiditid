import React from 'react';
import type { Disruption } from '../lib/types';
import { colors } from './styles';

type Props = {
  disruptions: Disruption[];
};

/** "Gröna linjen 17", "Gröna linjen 19", "Buss 4" → "Gröna linjen 17, 19 · Buss 4". */
export function formatLines(lines: string[]): string {
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
  return order.map((name) => `${name} ${groups.get(name)!.join(', ')}`.trim()).join(' · ');
}

/**
 * A4/C3: störningar en gång per linje, överst på tavlan, i stället för samma gula text
 * på var tredje rad. Ihopfällda till två rader; ett tryck visar hela texten.
 */
export default function DisruptionBox({ disruptions }: Props) {
  if (disruptions.length === 0) return null;
  return (
    <section aria-label="Störningar" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
      {disruptions.map((d) => (
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
              fontSize: '13px',
              lineHeight: 1.4,
              listStyle: 'none',
            }}
          >
            <strong style={{ color: colors.delayedText }}>
              <span aria-hidden="true">⚠ </span>
              {formatLines(d.lines)}
            </strong>
            <span className="disruption-teaser" style={{ display: 'block', color: colors.textSoft }}>
              {d.text}
            </span>
          </summary>
          <p style={{ margin: 0, padding: '0 12px 12px', fontSize: '13px', lineHeight: 1.5, color: colors.textSoft }}>
            {d.text}
          </p>
        </details>
      ))}
    </section>
  );
}
