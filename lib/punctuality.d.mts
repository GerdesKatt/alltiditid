export const MIN_SAMPLES: number;
export const MIN_LATE: number;
export function median(values: number[]): number | null;
export function punctualityKey(line: string, destination: string): string;
export function summarize(
  rows: { line: string; destination: string; delay_min: number; weekday: number }[],
  weekday: number
): Record<string, { late: number; n: number; weekday: boolean }>;
export function doorRange(text: string): { from: number; to: number; total: number } | null;
