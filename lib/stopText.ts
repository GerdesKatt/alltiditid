// Utan import av hållplatslistan, så att appen i webbläsaren kan använda den.

/** "T-bana, spårvagn och buss". */
export function modesText(modes: string[]): string {
  // Hårt bindestreck (U+2011) så att "T-bana" inte bryts mellan raderna.
  const words = modes.map((m) => (m === 'T-bana' ? 'T\u2011bana' : m.toLowerCase()));
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} och ${words[words.length - 1]}`;
}

/** ResRobot döper en punkt utan hållplats till "59.310049, 18.022752". Visa aldrig det. */
export function isCoordName(name: string): boolean {
  return /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/.test(String(name || ''));
}

/** Namnet på en plats i resan, eller `fallback` ("målet") där det bara finns koordinater. */
export function spotName(name: string, fallback: string): string {
  return !name || isCoordName(name) ? fallback : name;
}
