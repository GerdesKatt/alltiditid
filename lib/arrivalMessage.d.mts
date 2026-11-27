export function buildArrivalMessage(
  arrival: { train: string; stop: string; scheduled: string; expected?: string; delay?: number },
  lang?: 'sv' | 'en'
): string;
