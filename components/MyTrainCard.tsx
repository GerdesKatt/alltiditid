import React, { useEffect, useState } from 'react';
import type { MyTrain } from '../lib/myTrain';
import { arrivalAt, BYTE_EVENT, COMPENSATION_DELAY_MIN, loadByte, storeByte, verdict } from '../lib/byte';
import type { Connection, SavedByte } from '../lib/byte';
import { colors, fonts } from './styles';
import { compensationLink } from '../lib/compensation';
import { lineLabel, trackLabel, trainPosition, useLang } from '../lib/i18n';

type Part = { scheduled: string; estimated?: string; actual?: string; delay: number };
type Stop = { name: string; arrival?: Part; departure?: Part; passed?: boolean };
type Journey = { number: string; date?: string; product: string; operator?: string; to?: string; position?: string; stops: Stop[] };

const smallButton: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 14px',
  borderRadius: 'var(--radius-control)',
  border: `1px solid ${colors.borderStrong}`,
  backgroundColor: colors.surface,
  color: colors.text,
  fontSize: '0.875rem',
  fontWeight: 700,
  cursor: 'pointer',
};

/**
 * Mitt tåg under Min resa: läge, ankomst, om man hinner det sparade bytet,
 * och rätten till ersättning när tåget kommit fram sent.
 */
export default function MyTrainCard({
  train,
  onOpen,
  onPickByte,
  onRemove,
}: {
  train: MyTrain;
  onOpen: () => void;
  /** Öppnar tågets resa för att välja station och byte. */
  onPickByte: () => void;
  onRemove: () => void;
}) {
  const { lang, t } = useLang();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [byte, setByte] = useState<SavedByte | null>(null);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [transfer, setTransfer] = useState(4);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    function load() {
      fetch(`/api/trafik?action=train&number=${encodeURIComponent(train.number)}`)
        .then(async (res) => ({ ok: res.ok, status: res.status, data: res.ok ? await res.json() : null }))
        .then(({ ok, status, data }) => {
          if (!active) return;
          if (ok && data) {
            setJourney(data);
            setNotFound(false);
          } else if (status === 404) {
            setNotFound(true);
          }
        })
        .catch(() => {});
      if (active) setByte(loadByte(train.number));
    }
    load();
    // Bytet sparas i tågets resa: visa det här direkt.
    const onByte = () => active && setByte(loadByte(train.number));
    window.addEventListener(BYTE_EVENT, onByte);
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(BYTE_EVENT, onByte);
    };
  }, [train.number]);

  const last = journey?.stops[journey.stops.length - 1];
  const byteStop = byte ? journey?.stops.find((s) => s.name === byte.station) : undefined;
  const offStop = train.off ? journey?.stops.find((s) => s.name === train.off) : undefined;
  const target = byteStop || offStop || last;
  const arr = target?.arrival;
  const shown = arr?.actual || arr?.estimated;
  const byteArrival = journey && byteStop ? arrivalAt(journey, byteStop) : '';

  // Hinner jag bytet? Räknas om när tågets väntade ankomst ändras.
  useEffect(() => {
    if (!byte || !byteArrival) {
      setConnections(null);
      return;
    }
    let active = true;
    fetch(
      `/api/trafik?action=connections&station=${encodeURIComponent(byte.station)}&arrival=${encodeURIComponent(
        byteArrival
      )}&train=${encodeURIComponent(train.number)}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setTransfer(Number(data.transfer) || 4);
        setConnections(Array.isArray(data.departures) ? data.departures : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [byte, byteArrival, train.number]);

  const savedConn =
    byte && connections
      ? connections.find((c) => c.line === byte.line && c.scheduledTime === byte.scheduledTime) || null
      : null;
  const v = savedConn ? verdict(savedConn, transfer, lang) : null;
  const verdictColor = !v ? colors.textDim : v.tone === 'miss' ? colors.cancelledText : v.tone === 'tight' ? colors.amber : colors.okText;

  // Ersättning: tåget har kommit fram (eller passerat) dit man skulle, minst 20 min sent.
  const arrived = Boolean(arr?.actual) || Boolean(target?.passed);
  const lateBy = arr?.delay || 0;
  const compensation = lateBy >= COMPENSATION_DELAY_MIN;
  // Bolagets egen ansökan, när vi vet vilket bolag som kör tåget.
  const claim = compensationLink(journey?.operator, journey?.product);

  return (
    <section
      aria-label={`${t('Mitt tåg', 'My train')} ${train.number}`}
      style={{
        marginBottom: '14px',
        padding: '14px',
        borderRadius: 'var(--radius-card)',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-10px' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>{t('Mitt tåg', 'My train')}</span>
        <button
          type="button"
          onClick={onRemove}
          style={{ minHeight: '44px', padding: '0 4px 0 12px', marginRight: '-4px', border: 'none', background: 'none', color: colors.textDim, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
        >
          {t('Ta bort', 'Remove')}
          <span className="sr-only"> {t('mitt tåg', 'my train')}</span>
        </button>
      </div>

      <h2 style={{ margin: 0, fontFamily: fonts.display, fontSize: '1.125rem', fontWeight: 800 }}>
        {journey ? `${journey.product} ${journey.number}` : `${t('Tåg', 'Train')} ${train.number}`}
        {journey?.to ? <span style={{ fontWeight: 600, color: colors.textDim }}> {t('mot', 'to')} {journey.to}</span> : null}
      </h2>
      {journey?.position ? (
        <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0 0', fontSize: '0.9375rem', fontWeight: 600 }}>
          <span className="rt-dot" aria-hidden="true" />
          {trainPosition(journey.position, lang)}
        </p>
      ) : journey ? null : notFound ? (
        <p role="alert" style={{ margin: '6px 0 0', fontSize: '0.9375rem', color: colors.errorText }}>
          {t(
            `Hittar inget tåg ${train.number} i dag. Kontrollera numret på biljetten.`,
            `Can't find train ${train.number} today. Check the number on your ticket.`
          )}
        </p>
      ) : (
        <p style={{ margin: '6px 0 0', color: colors.textDim }}>{t('Hämtar tåget…', 'Loading the train…')}</p>
      )}
      {target && arr ? (
        <p style={{ margin: '6px 0 0', fontSize: '0.9375rem' }}>
          {arrived ? t('Kom fram till', 'Arrived at') : t('Framme i', 'Arrives at')} {target.name}{' '}
          {shown && shown !== arr.scheduled ? (
            <>
              <s style={{ color: colors.textDim }}>{arr.scheduled}</s>{' '}
              <strong style={{ fontFamily: fonts.display, color: colors.amber, whiteSpace: 'nowrap' }}>
                {shown}
                {lateBy > 0 ? ` +${lateBy} min` : ''}
              </strong>
            </>
          ) : (
            <strong style={{ fontFamily: fonts.display }}>{arr.scheduled}</strong>
          )}
        </p>
      ) : null}

      {/* Hinner jag bytet: svaret direkt på kortet. */}
      {byte ? (
        <div
          aria-live="polite"
          style={{
            margin: '10px 0 0',
            padding: '10px 12px',
            borderRadius: 'var(--radius-control)',
            border: `1px solid ${v && v.tone !== 'ok' ? verdictColor : colors.borderStrong}`,
          }}
        >
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>{t('Byte i', 'Change at')} {byte.station}</div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 700, marginTop: '2px' }}>
            {lineLabel(byte.line, lang)} {t('mot', 'to')} {byte.destination} {byte.scheduledTime}
          </div>
          <div style={{ fontFamily: fonts.display, fontSize: '1.125rem', fontWeight: 800, marginTop: '2px', color: verdictColor }}>
            {!connections
              ? t('Räknar…', 'Checking…')
              : v
              ? v.text || t('Ingen realtid för bytet', 'No live data for the connection')
              : t('Bytet finns inte längre på tavlan', 'The connection is no longer on the board')}
            {savedConn?.track ? (
              <span style={{ fontFamily: fonts.text, fontSize: '0.875rem', fontWeight: 500, color: colors.textDim }}> · {trackLabel(savedConn.track, lang)}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => storeByte(null)}
            style={{ minHeight: '44px', padding: 0, border: 'none', background: 'none', color: colors.textDim, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {t('Ta bort bytet', 'Remove the connection')}
          </button>
        </div>
      ) : null}

      {compensation ? (
        <div
          style={{
            margin: '10px 0 0',
            padding: '10px 12px',
            borderRadius: 'var(--radius-control)',
            backgroundColor: colors.delayedBg,
            border: `1px solid ${colors.delayedBorder}`,
            fontSize: '0.875rem',
            lineHeight: 1.45,
          }}
        >
          <strong style={{ display: 'block', color: colors.delayedText }}>
            {arrived
              ? t(`${lateBy} min sent till ${target?.name}`, `${lateBy} min late to ${target?.name}`)
              : t(`Väntas bli ${lateBy} min sent till ${target?.name}`, `Expected ${lateBy} min late to ${target?.name}`)}
          </strong>
          {t(
            `Vid minst ${COMPENSATION_DELAY_MIN} minuters försening kan du ha rätt till ersättning.`,
            `With a delay of at least ${COMPENSATION_DELAY_MIN} minutes you may be entitled to compensation.`
          )}{' '}
          <a
            href={claim.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontWeight: 700, color: colors.delayedText }}
          >
            {claim.name ? t(`Så söker du hos ${claim.name}`, `How to claim from ${claim.name}`) : t('Så ansöker du', 'How to claim (in Swedish)')}
          </a>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
        {notFound ? null : (
          <button type="button" onClick={onOpen} style={smallButton}>
            {t('Hela resan', 'Whole journey')}
          </button>
        )}
        {notFound ? null : (
          <button type="button" onClick={onPickByte} style={smallButton}>
            {byte ? t('Ändra byte', 'Change connection') : t('Kolla ett byte', 'Check a connection')}
          </button>
        )}
      </div>
    </section>
  );
}
