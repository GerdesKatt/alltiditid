export function foldName(s: string): string;
export function editDistance(a: string, b: string, max?: number): number;
export function fuzzyStops<T extends { name: string; daily?: number }>(query: string, stops: T[], limit?: number): T[];
