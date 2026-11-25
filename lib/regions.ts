import type { Region } from './types';

export const REGIONS: Region[] = [
  {
    key: 'all',
    label: 'Hela Sverige',
    stations: [
      { id: '740000001', name: 'Stockholm Centralstation', shortName: 'Stockholm C' },
      { id: '740020749', name: 'T-Centralen', shortName: 'T-Centralen' },
      { id: '740000002', name: 'Göteborg Centralstation', shortName: 'Göteborg C' },
      { id: '740000003', name: 'Malmö Centralstation', shortName: 'Malmö C' },
      { id: '740000120', name: 'Lund Centralstation', shortName: 'Lund C' },
      { id: '740000556', name: 'Stockholm Arlanda Airport', shortName: 'Arlanda' },
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
      { id: '740020749', name: 'T-Centralen', shortName: 'T-Centralen' },
      { id: '740000001', name: 'Stockholm Centralstation', shortName: 'Stockholm C' },
      { id: '740020751', name: 'Slussen', shortName: 'Slussen' },
      { id: '740020755', name: 'Odenplan', shortName: 'Odenplan' },
      { id: '740020754', name: 'Gullmarsplan', shortName: 'Gullmarsplan' },
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
      { id: '740000002', name: 'Göteborg Centralstation', shortName: 'Göteborg C' },
      { id: '740025614', name: 'Brunnsparken', shortName: 'Brunnsparken' },
      { id: '740025624', name: 'Korsvägen', shortName: 'Korsvägen' },
      { id: '740025619', name: 'Järntorget', shortName: 'Järntorget' },
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
      { id: '740001581', name: 'Triangeln', shortName: 'Triangeln' },
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
