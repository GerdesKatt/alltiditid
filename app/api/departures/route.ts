import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Departure = {
  id: string;
  line: string;
  operator: string;
  destination: string;
  scheduledTime: string;
  estimatedTime: string;
  status: 'on-time' | 'delayed' | 'cancelled';
  track: string;
  type: 'train' | 'bus' | 'flight';
};

const MOCK_DATA: Record<string, Departure[]> = {
  'Stockholm C': [
    { id: '1', line: 'SJ 425', operator: 'SJ Snabbtåg', destination: 'Göteborg C', scheduledTime: '14:15', estimatedTime: '14:15', status: 'on-time', track: 'Spår 10', type: 'train' },
    { id: '2', line: 'SL 43', operator: 'SL Pendeltåg', destination: 'Bålsta', scheduledTime: '14:18', estimatedTime: '14:26', status: 'delayed', track: 'Spår 1', type: 'train' },
    { id: '3', line: 'Mälartåg 237', operator: 'Mälartåg', destination: 'Uppsala C', scheduledTime: '14:22', estimatedTime: '14:22', status: 'on-time', track: 'Spår 4', type: 'train' },
    { id: '4', line: 'SJ 533', operator: 'SJ Snabbtåg', destination: 'Malmö C', scheduledTime: '14:30', estimatedTime: '14:30', status: 'cancelled', track: 'Spår 12', type: 'train' },
    { id: '5', line: 'Arlanda Express', operator: 'A-Train', destination: 'Arlanda Södra/Norra', scheduledTime: '14:35', estimatedTime: '14:35', status: 'on-time', track: 'Spår 1', type: 'train' },
  ],
  'Göteborg C': [
    { id: '6', line: 'SJ 428', operator: 'SJ Snabbtåg', destination: 'Stockholm C', scheduledTime: '14:20', estimatedTime: '14:20', status: 'on-time', track: 'Spår 4', type: 'train' },
    { id: '7', line: 'Västtåg 3214', operator: 'Västtrafik', destination: 'Alingsås', scheduledTime: '14:25', estimatedTime: '14:34', status: 'delayed', track: 'Spår 9', type: 'train' },
    { id: '8', line: 'Öresundståg 1045', operator: 'Öresundståg', destination: 'Köpenhamn H', scheduledTime: '14:40', estimatedTime: '14:40', status: 'on-time', track: 'Spår 2', type: 'train' },
  ],
  'Malmö C': [
    { id: '9', line: 'Öresundståg 1052', operator: 'Öresundståg', destination: 'Köpenhamn H', scheduledTime: '14:16', estimatedTime: '14:16', status: 'on-time', track: 'Spår 1', type: 'train' },
    { id: '10', line: 'Pågatåg 1642', operator: 'Skånetrafiken', destination: 'Lund C', scheduledTime: '14:21', estimatedTime: '14:29', status: 'delayed', track: 'Spår 3', type: 'train' },
    { id: '11', line: 'SJ 536', operator: 'SJ Snabbtåg', destination: 'Stockholm C', scheduledTime: '14:45', estimatedTime: '14:45', status: 'on-time', track: 'Spår 6', type: 'train' },
  ],
  'Arlanda': [
    { id: '12', line: 'SK 152', operator: 'SAS', destination: 'Göteborg (GOT)', scheduledTime: '15:05', estimatedTime: '15:05', status: 'on-time', track: 'Gate F32', type: 'flight' },
    { id: '13', line: 'DY 4311', operator: 'Norwegian', destination: 'Malmö (MMX)', scheduledTime: '15:20', estimatedTime: '15:55', status: 'delayed', track: 'Gate D14', type: 'flight' },
    { id: '14', line: 'LH 2417', operator: 'Lufthansa', destination: 'München (MUC)', scheduledTime: '15:40', estimatedTime: '15:40', status: 'on-time', track: 'Gate F60', type: 'flight' },
  ],
};

const STOP_IDS: Record<string, string> = {
  'Stockholm C': '740000001',
  'Göteborg C': '740000002',
  'Malmö C': '740000003',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const station = searchParams.get('station') || 'Stockholm C';

  const resrobotKey = process.env.TRAFIKLAB_RESROBOT_KEY;
  const stopId = STOP_IDS[station];

  if (resrobotKey && stopId) {
    try {
      const url = `https://api.resrobot.se/v2.1/departureBoard?id=${stopId}&format=json&accessId=${resrobotKey}&maxJourneys=10`;
      const res = await fetch(url, { next: { revalidate: 30 } });

      if (res.ok) {
        const data = await res.json();
        const rawList = data.Departure || [];

        if (rawList.length > 0) {
          const departures: Departure[] = rawList.map((item: any, idx: number) => {
            const sched = (item.time || '').slice(0, 5);
            const rt = (item.rtTime || item.time || '').slice(0, 5);
            const isDelayed = rt && sched && rt !== sched;
            const isCancelled = Boolean(item.cancelled);

            return {
              id: item.journeyDetailRef?.ref || String(idx),
              line: item.ProductAtStop?.displayNumber || item.name || 'Tåg/Buss',
              operator: item.ProductAtStop?.operator || 'Kollektivtrafik',
              destination: item.direction || 'Okänd destination',
              scheduledTime: sched,
              estimatedTime: rt || sched,
              status: isCancelled ? 'cancelled' : isDelayed ? 'delayed' : 'on-time',
              track: item.rtTrack || item.track ? `Spår/Läge ${item.rtTrack || item.track}` : '—',
              type: 'train',
            };
          });

          return NextResponse.json({
            station,
            source: 'live',
            departures,
          });
        }
      }
    } catch {
      // Faller tillbaka på mock-data nedan om anropet misslyckas
    }
  }

  const fallback = MOCK_DATA[station] || MOCK_DATA['Stockholm C'];
  return NextResponse.json({
    station,
    source: 'demo',
    departures: fallback,
  });
}
