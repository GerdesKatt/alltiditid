export function foldPlace(text: string | undefined | null): string;
export function stopsAfter(
  journey: { stops?: { name: string; departure?: { scheduled?: string } }[] } | null | undefined,
  scheduledTime: string
): string[] | null;
export function matchConnection(
  connection: { destination?: string; stopsAfter?: string[]; viaStops?: string[] },
  query: string
): { hit: boolean; via?: string };
