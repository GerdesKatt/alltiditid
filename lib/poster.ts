/**
 * Storläget som affisch (Vägen till 10 del 2, idé 10): en bild i Rosa betong av avgången,
 * ritad i webbläsaren och delad med telefonens egen delningsruta. Inget laddas upp.
 */
export type PosterInfo = { badge: string; towards: string; big: string; status: string; verdict: string; dark: boolean };

export async function drawPoster(info: PosterInfo, fontFamily: string): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const bg = info.dark ? '#2a2120' : '#f2c4be';
  const ink = info.dark ? '#ecece8' : '#111111';
  const muted = info.dark ? '#b9afad' : '#4a4744';
  const line = info.dark ? '#f2c4be' : '#111111';
  const font = (weight: number, px: number) => `${weight} ${px}px ${fontFamily}`;
  try {
    await document.fonts?.ready;
  } catch {
    // Reservtypsnittet duger.
  }
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // Strecket överst, som på sidan.
  g.fillStyle = line;
  g.fillRect(0, 0, W, 10);
  const pad = 88;
  // Linjebrickan och målet.
  g.font = font(800, 56);
  const bw = Math.max(110, g.measureText(info.badge).width + 40);
  g.fillStyle = ink;
  g.fillRect(pad, 300, bw, 84);
  g.fillStyle = bg;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(info.badge, pad + bw / 2, 344);
  g.textAlign = 'left';
  g.fillStyle = ink;
  g.font = font(700, 56);
  g.fillText(info.towards, pad + bw + 28, 344, W - pad * 2 - bw - 28);
  // Siffran så stor bredden tillåter.
  let size = 340;
  g.font = font(800, size);
  while (g.measureText(info.big).width > W - pad * 2 && size > 120) {
    size -= 10;
    g.font = font(800, size);
  }
  g.textBaseline = 'alphabetic';
  g.fillText(info.big, pad - 6, 470 + size * 0.78);
  const lineY = 470 + size * 0.78 + 70;
  g.fillStyle = line;
  g.fillRect(pad, lineY, W - pad * 2, 4);
  g.fillStyle = ink;
  g.font = font(800, 64);
  g.fillText(info.verdict, pad, lineY + 100, W - pad * 2);
  g.fillStyle = muted;
  g.font = font(400, 44);
  g.fillText(info.status, pad, lineY + 170, W - pad * 2);
  // Ordmärket nere till vänster.
  g.fillStyle = ink;
  g.font = font(800, 52);
  g.fillText('alltid i tid', pad, H - 110);
  g.fillStyle = muted;
  g.font = font(400, 32);
  g.fillText('alltiditid.se', pad, H - 64);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** Delar bilden med telefonens delningsruta, annars laddas den ned. Svarar false om inget gick. */
export async function sharePoster(blob: Blob, name: string): Promise<boolean> {
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  try {
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file] });
      return true;
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return true;
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
