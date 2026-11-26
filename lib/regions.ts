import type { Region } from './types';
import { groupStop, STATION_GROUPS } from './stationGroups.mjs';

// Stationer som är flera hållplatser hos Trafiklab (lib/stationGroups.mjs).
const [STOCKHOLM_C, GOTEBORG_C, ARLANDA, SLUSSEN] = STATION_GROUPS.map(groupStop);

export const REGIONS: Region[] = [
  {
    key: 'all',
    label: 'Hela Sverige',
    stations: [
      STOCKHOLM_C,
      GOTEBORG_C,
      { id: '740000003', name: 'Malmö Centralstation', shortName: 'Malmö C' },
      { id: '740000120', name: 'Lund Centralstation', shortName: 'Lund C' },
      ARLANDA,
    ],
    modes: [
      { key: 'all', label: 'Alla' },
      { key: 'train', label: 'Tåg' },
      { key: 'commuter', label: 'Pendel' },
      { key: 'subway', label: 'T-bana' },
      { key: 'tram', label: 'Spårvagn' },
      { key: 'bus', label: 'Buss' },
    ],
  },
  {
    key: 'stockholm',
    label: 'Stockholm',
    stations: [
      STOCKHOLM_C,
      SLUSSEN,
      { id: '740098559', name: 'Odenplan', shortName: 'Odenplan' },
      { id: '740021705', name: 'Gullmarsplan', shortName: 'Gullmarsplan' },
    ],
    modes: [
      { key: 'all', label: 'Alla' },
      { key: 'subway', label: 'T-bana' },
      { key: 'commuter', label: 'Pendeltåg' },
      { key: 'bus', label: 'SL-buss' },
      { key: 'tram', label: 'Tvärbana/Lokal' },
      { key: 'train', label: 'Fjärr/Regional' },
    ],
  },
  {
    key: 'goteborg',
    label: 'Göteborg',
    stations: [
      GOTEBORG_C,
      { id: '740020752', name: 'Brunnsparken', shortName: 'Brunnsparken' },
      { id: '740015578', name: 'Korsvägen', shortName: 'Korsvägen' },
      { id: '740015573', name: 'Järntorget', shortName: 'Järntorget' },
    ],
    modes: [
      { key: 'all', label: 'Alla' },
      { key: 'tram', label: 'Spårvagn' },
      { key: 'bus', label: 'Buss' },
      { key: 'commuter', label: 'Pendel/Tåg' },
      { key: 'ferry', label: 'Båt/Färja' },
      { key: 'train', label: 'Fjärrtåg' },
    ],
  },
  {
    key: 'skane',
    label: 'Skåne',
    stations: [
      { id: '740000003', name: 'Malmö Centralstation', shortName: 'Malmö C' },
      { id: '740000120', name: 'Lund Centralstation', shortName: 'Lund C' },
      { id: '740001587', name: 'Triangeln', shortName: 'Triangeln' },
      { id: '740000044', name: 'Helsingborg Centralstation', shortName: 'Helsingborg C' },
    ],
    modes: [
      { key: 'all', label: 'Alla' },
      { key: 'commuter', label: 'Pågatåg/Öresund' },
      { key: 'bus', label: 'Buss' },
      { key: 'train', label: 'Fjärrtåg' },
    ],
  },
];
