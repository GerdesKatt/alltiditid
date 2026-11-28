'use client';

import React, { useEffect, useState } from 'react';
import type { Flight, SecurityQueue } from '../lib/types';
import type { MyFlight } from '../lib/myFlight';
import { airportByIata } from '../lib/flights.mjs';
import { gatePlan, gateStage, queueNowFor, typicalQueueFor } from '../lib/gateTime.mjs';
import { stockholmMinute } from '../lib/sweTime.mjs';
import { flightStatus, useLang } from '../lib/i18n';
import { parseLocal } from '../lib/lineFormat';
import { colors, fonts } from './styles';

/**
 * Mitt flyg under Min resa: terminal, gate, boarding och när man senast bör vara vid
 * säkerhetskontrollen, från samma flygtavla som fliken Flyg (uppdateras varannan minut).
 */
export default function MyFlightCard({ saved, now, onRemove }: { saved: MyFlight; now: number; onRemove: () => void }) {
  const { lang, t } = useLang();
  const [flight, setFlight] = useState<Flight | null>(null);
  const [missing, setMissing] = useState(false);
  const [queues, setQueues] = useState<SecurityQueue[]>([]);
  const airport = airportByIata(saved.airport);

  useEffect(() => {
    let active = true;
    function load() {
      fetch(`/api/trafik?action=flights&airport=${saved.airport}&direction=departures`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!active || !data || !Array.isArray(data.flights)) return;
          const f = (data.flights as Flight[]).find((x) => x.flightId === saved.flightId && x.scheduledAt === saved.scheduledAt);
          setFlight(f || null);
          setMissing(!f);
        })
        .catch(() => {});
      if (airport?.waitTimes) {
        fetch(`/api/trafik?action=waittimes&airport=${saved.airport}`)
          .then((res) => res.json())
          .then((data) => active && setQueues(Array.isArray(data.queues) ? data.queues : []))
          .catch(() => {});
      }
    }
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 120_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [saved.airport, saved.flightId, saved.scheduledAt, airport?.waitTimes]);

  const f = flight;
  const departsAt = f ? parseLocal(f.expectedAt) : null;
  const soon = departsAt !== null && departsAt - now < 3 * 3600_000;
  const queueNow = f && soon ? queueNowFor(queues, f.terminal) : null;
  // Längre fram: den typiska kötiden ("Brukar vara") för terminalen timmen före avgång.
  const [typical, setTypical] = useState<number | null>(null);
  const day = saved.scheduledAt.slice(0, 10);
  const needTypical = Boolean(f) && !soon && Boolean(airport?.waitTimes);
  const terminal = f?.terminal;
  useEffect(() => {
    if (!needTypical || !f) return;
    let active = true;
    fetch(`/api/trafik?action=queueforecast&airport=${saved.airport}&date=${day}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => active && setTypical(typicalQueueFor(d, f)))
      .catch(() => active && setTypical(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needTypical, saved.airport, day, terminal]);
  const usingTypical = queueNow === null && !soon && typical !== null;
  const plan = f ? gatePlan(f, saved.airport, queueNow ?? (usingTypical ? typical : null)) : null;
  const gateStatus = f ? flightStatus(f.gateText, lang) : '';
  // Samma regel som på Flyg: ingen security-tid som redan passerat (UX-revisionen, fynd 1).
  const stage = f ? gateStage(f, plan, stockholmMinute(now)) : 'ok';

  return (
    <section
      aria-label={`${t('Mitt flyg', 'My flight')} ${saved.flightId}`}
      style={{
        marginBottom: '14px',
        padding: '14px',
        borderRadius: 'var(--radius-card)',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-10px' }}>
        <span style={{ fontSize: 'var(--fs-2)', fontWeight: 700, color: colors.textDim }}>
          {t('Mitt flyg', 'My flight')} · {airport?.short || saved.airport}
        </span>
        <button
          type="button"
          onClick={onRemove}
          style={{ minHeight: '44px', padding: '0 4px 0 12px', marginRight: '-4px', border: 'none', background: 'none', color: colors.textDim, fontSize: 'var(--fs-2)', fontWeight: 700, cursor: 'pointer' }}
        >
          {t('Ta bort', 'Remove')}
          <span className="sr-only"> {t('mitt flyg', 'my flight')}</span>
        </button>
      </div>

      <h2 style={{ margin: 0, fontFamily: fonts.display, fontSize: 'var(--fs-4)', fontWeight: 800 }}>
        {saved.flightId}
        {f?.place ? <span style={{ fontWeight: 700, color: colors.textDim }}> {t('till', 'to')} {f.place}</span> : null}
        <span style={{ float: 'right' }}>{f?.status === 'delayed' && f.newTime ? f.newTime : saved.scheduledAt.slice(11, 16)}</span>
      </h2>

      {f ? (
        <div style={{ marginTop: '8px', fontSize: 'var(--fs-3)', lineHeight: 1.6 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {f.terminal ? (
              <span
                style={{
                  padding: '0 6px',
                  borderRadius: 'var(--radius-badge)',
                  border: `1.5px solid ${colors.text}`,
                  fontFamily: fonts.display,
                  fontWeight: 800,
                }}
              >
                Terminal {f.terminal}
              </span>
            ) : null}
            <span>{f.gate ? `Gate ${f.gate}` : t('Gate visas ca en timme före avgång', 'Gate shown about an hour before departure')}</span>
          </div>
          {f.status === 'cancelled' ? (
            <div style={{ color: colors.cancelledText, fontWeight: 700, marginTop: '6px' }}>{t('Inställt', 'Cancelled')}</div>
          ) : f.done ? (
            <div style={{ marginTop: '6px' }}>{t('Har lyft. Trevlig resa!', 'Departed. Have a good trip!')}</div>
          ) : plan && stage !== 'ok' ? (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontWeight: 700, color: colors.amber }}>
                {stage === 'closed' ? t('Gaten är stängd', 'The gate is closed') : t('Security-tiden har passerat', 'Security time has passed')}
              </div>
              <div>
                {stage === 'closed'
                  ? t('Fråga flygbolaget om du inte hunnit fram.', 'Ask the airline if you have not made it.')
                  : f.gate
                  ? t(`Gå direkt till gate ${f.gate}. Gaten stänger ca ${plan.gateCloses}.`, `Go straight to gate ${f.gate}. The gate closes around ${plan.gateCloses}.`)
                  : t(`Gå direkt till gaten. Den stänger ca ${plan.gateCloses}.`, `Go straight to the gate. It closes around ${plan.gateCloses}.`)}
              </div>
            </div>
          ) : plan ? (
            <>
              {f.status === 'delayed' ? (
                <div style={{ color: colors.amber, fontWeight: 700 }}>
                  {t('Försenat', 'Delayed')} +{f.delayMinutes} min
                </div>
              ) : null}
              <div style={{ fontWeight: 700, marginTop: '6px' }}>
                {t('Var vid security senast', 'Be at security by')} {plan.atSecurity}
              </div>
              <div>
                {gateStatus ? <strong style={{ color: colors.amber }}>{gateStatus} · </strong> : null}
                {t('Boarding ca', 'Boarding ~')} {plan.boarding} · {t('gaten stänger ca', 'gate closes ~')} {plan.gateCloses}
              </div>
              <div style={{ color: colors.textDim, fontSize: 'var(--fs-2)' }}>
                {plan.queue !== null && usingTypical
                  ? t(`Med ${plan.queue} min kötid, som det brukar vara då, och ${plan.walkMin}–${plan.walkMax} min till gaten. Uppskattat.`, `With ${plan.queue} min at security, as it usually is then, and ${plan.walkMin}–${plan.walkMax} min to the gate. Estimated.`)
                  : plan.queue !== null
                  ? t(`Med ${plan.queue} min kötid just nu och ${plan.walkMin}–${plan.walkMax} min till gaten. Uppskattat.`, `With the queue now (${plan.queue} min) and ${plan.walkMin}–${plan.walkMax} min to the gate. Estimated.`)
                  : t(`Med ${plan.walkMin}–${plan.walkMax} min till gaten; kötiden räknas in närmare avgång. Uppskattat.`, `With ${plan.walkMin}–${plan.walkMax} min to the gate; the queue is added closer to departure. Estimated.`)}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div style={{ marginTop: '8px', fontSize: 'var(--fs-2)', color: colors.textDim }}>
          {missing
            ? t('Flyget syns inte på tavlan just nu. Det visas igen när Swedavia har det.', "The flight isn't on the board right now. It will show again once Swedavia lists it.")
            : t('Hämtar flyget…', 'Loading the flight…')}
        </div>
      )}
    </section>
  );
}
