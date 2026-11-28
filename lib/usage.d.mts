export function weekStart(day: string): string;
export function usageSignals(
  list: { t: number }[],
  now?: number
): { firstToday: boolean; firstThisWeek: boolean; week: 'ny' | 'ater' | 'tillbaka' };
export const KEY_ACTIONS: string[];
export function weeklyStats(
  rows: { day: string; name: string; label: string; n: number }[],
  feedback?: { day: string; n: number }[]
): {
  week: string;
  users: number;
  returning: number;
  fresh: number;
  comeback: number;
  dailyAvg: number;
  appShare: number;
  opens: number;
  opensApp: number;
  actions: Record<string, number>;
}[];
