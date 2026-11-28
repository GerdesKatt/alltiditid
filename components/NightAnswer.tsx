import React, { useEffect, useState } from 'react';
import type { Departure } from '../lib/types';
import { useLang, lineLabel } from '../lib/i18n';
import { stockholmDay, stockholmHour } from '../lib/sweTime.mjs';
import { boardUrl } from '../lib/prefetch';
import { parseLocal } from '../lib/lineFormat';
import { colors } from './styles';

/**
 * Natten har ett svar (Vägen till 10, idé 8): när sista avgången har gått säger tavlan när
 * den första går i morgon, i stället för en tom tavla. Ett enda anrop, bara när tavlan är tom på natten.
 */
export default function NightAnswer({ stopId, stopName, now }: { stopId: string; stopName: string; now: number }) {
  const { lang, t } = useLang();
  const [first, setFirst] = useState<Departure | null | undefined>(undefined);
  const hour = stockholmHour(now);
  // Efter kvällens sista: tidtabellen från 04:00, i dag om det redan är efter midnatt.
  const day = stockholmDay(hour >= 12 ? now + 24 * 3600_000 : now);
  useEffect(() => {
    let alive = true;
    setFirst(undefined);
    fetch(`${boardUrl(stopId, stopName, 'departures')}&time=${day}T04:00`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        const list: Departure[] = Array.isArray(data?.departures) ? data.departures : [];
        const next = list
          .filter((d) => d.status !== 'cancelled' && parseLocal(d.expectedAt) !== null)
          .sort((a, b) => (parseLocal(a.expectedAt) ?? 0) - (parseLocal(b.expectedAt) ?? 0))[0];
        setFirst(next || null);
      })
      .catch(() => alive && setFirst(null));
    return () => {
      alive = false;
    };
  }, [stopId, stopName, day]);

  const clock = first ? first.scheduledTime : '';
  return (
    <>
      <strong style={{ display: 'block', fontSize: 'var(--fs-4)', color: colors.text }}>
        {t('Sista avgången har gått.', 'The last departure has left.')}
      </strong>
      <span style={{ display: 'block', marginTop: '4px' }}>
        {first === undefined
          ? t('Letar upp morgonens första…', "Looking up the morning's first…")
          : first
          ? t(
              `Första går ${clock}: ${lineLabel(first.line, lang)} mot ${first.destination}.`,
              `The first leaves at ${clock}: ${lineLabel(first.line, lang)} to ${first.destination}.`
            )
          : t('Inga avgångar härifrån de närmaste timmarna.', 'No departures from here in the next few hours.')}
      </span>
    </>
  );
}
