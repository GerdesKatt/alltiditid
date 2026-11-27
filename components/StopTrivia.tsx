import React from 'react';
import type { Trivia } from '../lib/trivia.mjs';
import { colors } from './styles';
import { useLang } from '../lib/i18n';
import { track } from '../lib/track';

/**
 * "Visste du?": en lugn ruta med kuriosa om platsen, från Wikipedia.
 * Texten är CC BY-SA, så källan och licensen står alltid under.
 */
export default function StopTrivia({ trivia, stopName }: { trivia: Trivia; stopName: string }) {
  const { lang, t } = useLang();
  const lead =
    trivia.kind === 'area'
      ? t(`Om området runt ${stopName}: ${trivia.title}`, `About the area around ${stopName}: ${trivia.title}`)
      : trivia.kind === 'nearby'
      ? t(
          `Nära hållplatsen${trivia.meters ? `, ${trivia.meters} m bort` : ''}: ${trivia.title}`,
          `Near the stop${trivia.meters ? `, ${trivia.meters} m away` : ''}: ${trivia.title}`
        )
      : '';
  const otherLang = trivia.lang && trivia.lang !== lang;

  return (
    <section
      id="kuriosa"
      aria-labelledby="kuriosa-rubrik"
      style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${colors.border}` }}
    >
      <h3 id="kuriosa-rubrik" style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0, color: colors.text }}>
        {t('Visste du?', 'Did you know?')}
      </h3>
      {lead ? <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>{lead}</p> : null}
      <p lang={trivia.lang} style={{ margin: '6px 0 0', fontSize: '0.9375rem', lineHeight: 1.55, color: colors.textSoft }}>
        {trivia.text}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: colors.textFaint }}>
        <a
          href={trivia.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('funktion', 0, 'kuriosa_wikipedia')}
          style={{ color: colors.textDim, fontWeight: 600 }}
        >
          {t('Läs mer på Wikipedia ↗', 'Read more on Wikipedia ↗')}
        </a>
        {' · '}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/deed.sv"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: colors.textFaint }}
        >
          CC BY-SA
        </a>
        {otherLang ? ` · ${t('på engelska', 'in Swedish')}` : ''}
      </p>
    </section>
  );
}
