'use client';
import React, { useEffect, useState } from 'react';
import { colors } from './styles';
import { useLang } from '../lib/i18n';
import { mergeStops } from '../lib/stationGroups.mjs';
import { placeLabel, placeScore, rankPlaces, type FoundPlace } from '../lib/places.mjs';
import { loadStopIndex, stopPageFor } from '../lib/stopIndex';
import type { StopOption } from '../lib/types';

/** Ett valt mål: en hållplats (id) eller en plats eller adress (koordinater). */
export type ChosenPlace = {
  kind: 'stop' | 'poi' | 'address' | 'area';
  name: string;
  detail?: string;
  type?: string;
  id?: string;
  lat?: number;
  lon?: number;
};

type Props = {
  text: string;
  /** Tavlans hållplats: träffar nära den kommer först (bara ungefär, cirka 10 km). */
  nearStopId?: string;
  onPick: (place: ChosenPlace) => void;
  /** Listans id, så att fältet kan peka på den (aria-controls). */
  listId?: string;
};

/** Beskrivningen under namnet: "Hotell · Stockholm", "Hållplats · T-bana, Buss". */
export function placeDetail(p: ChosenPlace, lang: string): string {
  const t = (sv: string, en: string) => (lang === 'en' ? en : sv);
  const what =
    p.kind === 'stop'
      ? t('Hållplats', 'Stop')
      : p.kind === 'address'
        ? t('Adress', 'Address')
        : p.kind === 'area'
          ? t('Område', 'Area')
          : placeLabel(p.type, lang) || t('Plats', 'Place');
  return [what, p.detail].filter(Boolean).join(' · ');
}

/**
 * Förslag medan man skriver under "Vart ska du?": hållplatser, platser (hotell, arenor,
 * sjukhus) och adresser i en lista, bäst passande först. Felstavningar och saknade
 * prickar går bra: "clarion sign", "sodersjukhuset", "gulmarsplan".
 */
export default function PlaceSuggest({ text, nearStopId, onPick, listId = 'vart-ska-du-lista' }: Props) {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<ChosenPlace[]>([]);
  const [source, setSource] = useState('');
  const q = text.trim();

  useEffect(() => {
    if (q.length < 2) {
      setRows([]);
      return;
    }
    let alive = true;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const index = await loadStopIndex();
      const near = nearStopId ? stopPageFor(index, nearStopId) : undefined;
      const bias = near ? `&lat=${near.lat.toFixed(1)}&lon=${near.lon.toFixed(1)}` : '';
      const get = (url: string) =>
        fetch(url, { signal: ctrl.signal })
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({}));
      // Hållplatser (Trafiklab), platser och adresser (OpenStreetMap) samtidigt.
      const [s, p] = await Promise.all([
        get(`/api/trafik?action=search&q=${encodeURIComponent(q)}`),
        q.length >= 3 ? get(`/api/trafik?action=places&q=${encodeURIComponent(q)}${bias}`) : Promise.resolve({}),
      ]);
      if (!alive) return;
      const stops = (mergeStops((s as { stops?: StopOption[] }).stops || []) as StopOption[]).map((x) => ({
        kind: 'stop' as const,
        id: x.id,
        name: x.name,
        detail: [x.place, x.modes?.join(', ')].filter(Boolean).join(' · '),
      }));
      // De största hållplatserna finns i webbläsaren: hittar "gulmarsplan" när Trafiklab inte gör det.
      const local = (index?.list || [])
        .filter((x) => placeScore(q, x.name) >= 0.7)
        .slice(0, 3)
        .map((x) => ({ kind: 'stop' as const, id: x.id, name: x.name, detail: [x.place, x.modes.join(', ')].filter(Boolean).join(' · '), lat: x.lat, lon: x.lon }));
      const places = ((p as { places?: (FoundPlace & { score?: number })[] }).places || []) as (ChosenPlace & { score?: number })[];
      // Platserna är redan rangordnade av servern, som också förstår "gata nr ort"
      // (Blåklintsvägen i Herrängen för "Blåklintsvägen 4A Älvsjö"). Hållplatserna rangordnas här.
      const ranked = [...rankPlaces(q, [...stops, ...local]), ...places.filter((x) => (x.score ?? 0) > 0)].sort(
        (a, b) => (b.score ?? 0) - (a.score ?? 0)
      );
      // Trafiklabs egna träffar visas även om orden inte passar exakt (de kan känna till smeknamn).
      const list = ranked.length ? ranked : stops;
      const seen = new Set<string>();
      const out: ChosenPlace[] = [];
      for (const r of list) {
        const key = r.kind === 'stop' ? `s${r.name.toLowerCase()}` : `${r.kind}${r.name.toLowerCase()}${r.detail || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
        if (out.length === 5) break;
      }
      setRows(out);
      setSource((p as { source?: string }).source || '');
    }, 250);
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [q, nearStopId]);

  if (q.length < 2 || rows.length === 0) return null;
  const fromMap = rows.some((r) => r.kind !== 'stop');

  return (
    <div>
      <ul
        id={listId}
        role="listbox"
        aria-label={t('Förslag', 'Suggestions')}
        style={{ listStyle: 'none', margin: 0, padding: 0, border: `1px solid ${colors.borderStrong}`, borderTop: 'none' }}
      >
        {rows.map((r, i) => (
          <li key={`${r.kind}-${r.id || r.name}-${i}`} role="option" aria-selected={false}>
            <button
              type="button"
              // Före blur, så att tangentbordet på mobilen inte hinner flytta listan.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(r)}
              style={{
                display: 'block',
                width: '100%',
                minHeight: '52px',
                padding: '8px 12px',
                border: 'none',
                borderTop: i === 0 ? 'none' : `1px solid ${colors.border}`,
                background: 'transparent',
                color: colors.text,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'block', fontSize: '1rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </span>
              <span style={{ display: 'block', fontSize: '0.8125rem', color: colors.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {placeDetail(r, lang)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {fromMap ? (
        <p style={{ margin: '4px 0 0', fontSize: '0.6875rem', color: colors.textDim, textAlign: 'right' }}>
          {source === 'geoapify' ? (
            <>
              Powered by <a href="https://www.geoapify.com/" style={{ color: 'inherit' }}>Geoapify</a> ·{' '}
            </>
          ) : null}
          © <a href="https://www.openstreetmap.org/copyright" style={{ color: 'inherit' }}>OpenStreetMap</a>
        </p>
      ) : null}
    </div>
  );
}
