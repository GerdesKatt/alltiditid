// Utan import av hållplatslistan, så att appen i webbläsaren kan använda den.

/** "T-bana, spårvagn och buss". */
export function modesText(modes: string[]): string {
  // Hårt bindestreck (U+2011) så att "T-bana" inte bryts mellan raderna.
  const words = modes.map((m) => (m === 'T-bana' ? 'T\u2011bana' : m.toLowerCase()));
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} och ${words[words.length - 1]}`;
}
