import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../lib/i18n';
import { colors } from './styles';

type Props = {
  onTab: (index: 1 | 2 | 3) => void;
  onSearch: () => void;
  onSave?: () => void;
};

/**
 * Snabbkommandon på datorn (Vägen till 10 del 2, idé 19): / söker, 1–3 byter flik, S sparar
 * hållplatsen, F öppnar storläget och ? visar listan. Gäller aldrig när man skriver i ett fält
 * eller håller in Ctrl, Alt eller Cmd, så att webbläsarens egna genvägar fungerar som vanligt.
 */
export default function KeyboardShortcuts({ onTab, onSearch, onSave }: Props) {
  const { t } = useLang();
  const [help, setHelp] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const latest = useRef({ onTab, onSearch, onSave });
  latest.current = { onTab, onSearch, onSave };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      // Inte bakom ett öppet fönster (storläget, en tågsida): där gäller fönstrets egna tangenter.
      if (document.querySelector('[aria-modal="true"]') && e.key !== 'Escape') return;
      const { onTab: tab, onSearch: search, onSave: save } = latest.current;
      switch (e.key) {
        case '/':
          e.preventDefault();
          search();
          break;
        case '1':
        case '2':
        case '3':
          tab(Number(e.key) as 1 | 2 | 3);
          break;
        case 's':
        case 'S':
          if (save) save();
          break;
        case 'f':
        case 'F': {
          const big = document.querySelector<HTMLButtonElement>('.hero-card .big-open');
          big?.click();
          break;
        }
        case '?':
          setHelp(true);
          break;
        default:
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!help) return;
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') setHelp(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [help]);

  if (!help) return null;
  const rows: [string, string][] = [
    ['/', t('Sök hållplats', 'Search for a stop')],
    ['1', t('Avgångar', 'Departures')],
    ['2', t('Min resa', 'My trip')],
    ['3', t('Flyg', 'Flights')],
    ['S', t('Spara eller ta bort hållplatsen', 'Save or remove the stop')],
    ['F', t('Storläge', 'Full screen')],
    ['?', t('Den här listan', 'This list')],
  ];
  return (
    <div className="kbd-help-backdrop" onClick={() => setHelp(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="kbd-help-title" className="kbd-help" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
          <h2 id="kbd-help-title" style={{ margin: 0, fontSize: 'var(--fs-4)', fontWeight: 800 }}>
            {t('Snabbkommandon', 'Keyboard shortcuts')}
          </h2>
          <button ref={closeRef} type="button" className="row-link" onClick={() => setHelp(false)} style={{ minHeight: '44px', border: 'none', background: 'none', color: colors.text, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
            {t('Stäng', 'Close')}
          </button>
        </div>
        <dl style={{ margin: '8px 0 0' }}>
          {rows.map(([key, what]) => (
            <div key={key} style={{ display: 'flex', gap: '14px', alignItems: 'baseline', padding: '8px 0', borderTop: `1px solid ${colors.border}` }}>
              <dt style={{ margin: 0 }}>
                <kbd className="kbd">{key}</kbd>
              </dt>
              <dd style={{ margin: 0, fontSize: 'var(--fs-3)' }}>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
