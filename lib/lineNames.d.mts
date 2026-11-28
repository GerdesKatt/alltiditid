export function isRouteName(name: string): boolean;
export function shortLineName(name: string, modeLabel?: string): string;
/** "1b" blir "Spår 1b" för spårtrafik och "Läge C" för bussar. */
export function trackText(value: string | undefined, mode?: string): string;
