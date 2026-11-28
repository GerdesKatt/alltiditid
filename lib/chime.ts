/**
 * Ljudsignaturen (Vägen till 10 del 2, idé 9): annonsernas "tick-tick-ping", spelad med
 * webbläsarens egen ljudmotor, utan ljudfil. Bara när man själv har bett om ljud (Läs upp),
 * och tyst om webbläsaren inte tillåter ljud. Svarar när pinget klingat ut, så att rösten kan ta vid.
 */
export function playChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return resolve();
      const ctx = new Ctx();
      const blip = (at: number, freq: number, length: number, peak: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + length);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + length + 0.02);
      };
      blip(0, 1320, 0.05, 0.18);
      blip(0.16, 1320, 0.05, 0.18);
      blip(0.36, 1760, 0.6, 0.25);
      setTimeout(() => {
        ctx.close().catch(() => {});
        resolve();
      }, 1000);
    } catch {
      resolve();
    }
  });
}
