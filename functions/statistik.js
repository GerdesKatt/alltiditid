// Privat statistiksida: https://alltiditid.se/statistik?k=<nyckel>. Utan rätt nyckel svarar den 404.
import { handleStats } from './api/trafik.js';

export async function onRequest(context) {
  return await handleStats(new URL(context.request.url), context.env);
}
