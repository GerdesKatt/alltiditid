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
    trivia.kind === 'area' || trivia.kind === 'namesake'
      ? t(`Om ${trivia.title}`, `About ${trivia.title}`)
      : trivia.kind === 'nearby'
      ? t(
          `${trivia.title}${trivia.meters ? `, ${trivia.meters} m härifrån` : ''}`,
          `${trivia.title}${trivia.meters ? `, ${trivia.meters} m from here` : ''}`
        )
      : '';
  const around = (trivia.around || []).slice(0, 3);
  const otherLang = trivia.lang && trivia.lang !== lang;

  return (
    <section
      id="kuriosa"
      aria-labelledby="kuriosa-rubrik"
      style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${colors.border}` }}
    >
      <h3 id="kuriosa-rubrik" style={{ fontSize: 'var(--fs-3)', fontWeight: 700, margin: 0, color: colors.text }}>
        {t('Visste du?', 'Did you know?')}
      </h3>
      {lead ? <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-2)', fontWeight: 700, color: colors.textDim }}>{lead}</p> : null}
      <p lang={trivia.lang} style={{ margin: '6px 0 0', fontSize: 'var(--fs-3)', lineHeight: 1.55, color: colors.textSoft }}>
        {trivia.text}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-1)', color: colors.textFaint }}>
        <a
          href={trivia.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('funktion', 0, 'kuriosa_wikipedia')}
          style={{ color: colors.textDim, fontWeight: 700 }}
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

      {around.length ? (
        <>
          <h4 style={{ fontSize: 'var(--fs-2)', fontWeight: 700, margin: '14px 0 4px', color: colors.text }}>
            {t('Runt hörnet', 'Around the corner')}
          </h4>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {around.map((a) => (
              <li key={a.title} style={{ borderTop: `1px solid ${colors.border}` }}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track('funktion', 0, 'kuriosa_runt_horn')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    minHeight: '44px',
                    padding: '6px 0',
                    color: colors.text,
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 'var(--fs-2)' }}>{a.title}</strong>
                    <span lang={trivia.lang} style={{ fontSize: 'var(--fs-2)', color: colors.textDim }}>
                      {a.description}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 'var(--fs-2)', color: colors.textDim }}>{a.meters} m ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
