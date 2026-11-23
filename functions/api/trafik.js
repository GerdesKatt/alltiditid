async function fetchTrafikverketTrainUpdates(trafikverketKey, trainNumbers, activityType) {
  const updatesByTrain = new Map();
  if (!trafikverketKey || !Array.isArray(trainNumbers) || trainNumbers.length === 0) {
    return updatesByTrain;
  }

  const uniqueTrains = Array.from(
    new Set(trainNumbers.map((n) => String(n || '').trim()).filter(Boolean))
  ).slice(0, 20);

  if (uniqueTrains.length === 0) return updatesByTrain;

  const now = Date.now();
  const fromIso = new Date(now - 60 * 60 * 1000).toISOString();
  const toIso = new Date(now + 6 * 60 * 60 * 1000).toISOString();

  const tvActivity = activityType === 'arrivals' ? 'Ankomst' : 'Avgang';
  const trainCriteria = uniqueTrains
    .map(
      (num) =>
        `<EQ name="AdvertisedTrainIdent" value="${num.replace(/[^a-zA-Z0-9_-]/g, '')}" />`
    )
    .join('');

  const xmlBody = `<REQUEST>
  <LOGIN authenticationkey="${trafikverketKey}" />
  <QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="150">
    <FILTER>
      <AND>
        <EQ name="ActivityType" value="${tvActivity}" />
        <GTE name="AdvertisedTimeAtLocation" value="${fromIso}" />
        <LTE name="AdvertisedTimeAtLocation" value="${toIso}" />
        <OR>${trainCriteria}</OR>
      </AND>
    </FILTER>
    <INCLUDE>AdvertisedTrainIdent</INCLUDE>
    <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
    <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
    <INCLUDE>TimeAtLocation</INCLUDE>
    <INCLUDE>Canceled</INCLUDE>
    <INCLUDE>TrackAtLocation</INCLUDE>
  </QUERY>
</REQUEST>`;

  try {
    const tvRes = await fetch('https://api.trafikinfo.trafikverket.se/v2/data.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: xmlBody,
    });

    if (!tvRes.ok) return updatesByTrain;

    const tvData = await tvRes.json();
    const announcements = tvData?.RESPONSE?.RESULT?.[0]?.TrainAnnouncement || [];

    for (const ann of announcements) {
      const ident = String(ann.AdvertisedTrainIdent || '').trim();
      if (!ident) continue;

      const advClock = extractClockTime(ann.AdvertisedTimeAtLocation);
      const estClock = extractClockTime(
        ann.EstimatedTimeAtLocation || ann.TimeAtLocation || ''
      );
      const isCanceled = Boolean(ann.Canceled);

      const current = updatesByTrain.get(ident) || {
        newTime: '',
        delayMinutes: 0,
        cancelled: false,
        track: '',
      };

      if (isCanceled) {
        current.cancelled = true;
      }

      if (ann.TrackAtLocation) {
        current.track = String(ann.TrackAtLocation).trim();
      }

      if (estClock) {
        const diff = getDelayMinutes(advClock || estClock, estClock);
        if (diff !== null && diff > current.delayMinutes) {
          current.newTime = estClock;
          current.delayMinutes = diff;
        } else if (!current.newTime && estClock !== advClock) {
          current.newTime = estClock;
        }
      }

      updatesByTrain.set(ident, current);
    }
  } catch {
    // Fortsätt med ResRobot-data om Trafikverket inte svarar
  }

  return updatesByTrain;
}
