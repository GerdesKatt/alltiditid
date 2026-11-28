export function journeyLine(
  trip: { depDate: string; legs: Array<{ kind: string; mode?: string; from: { time: string; rtTime?: string }; to: { time: string; rtTime?: string } }> },
  now: number
): { fill: number; marks: Array<{ at: number; kind: 'ride' | 'end'; mode?: string }>; start: number; end: number } | null;
