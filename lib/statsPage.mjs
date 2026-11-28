import { KEY_ACTIONS } from './usage.mjs';

/**
 * Den privata statistiksidan (/statistik?k=…): veckosiffror ur de anonyma räkningarna.
 * Ren HTML utan skript, så att den går att öppna i vilken telefon som helst.
 */

export const GOAL_RETURNING = 1000;

const ACTION_NAMES = {
  sok: 'Sökningar',
  spara_resa: 'Sparade resor',
  planera_resa: 'Planerade resor',
  folj_tag: 'Följda tåg',
  folj_flyg: 'Följda flyg',
  tyck_till: 'Tyck till',
  hemskarm_lagd: 'Lagt på hemskärmen*',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (n) => Number(n || 0).toLocaleString('sv-SE');

/** ISO-veckonummer för en måndag (YYYY-MM-DD). */
export function isoWeek(monday) {
  const [y, m, d] = monday.split('-').map(Number);
  // Veckans torsdag avgör året; vecka 1 är den med årets första torsdag.
  const thursday = Date.UTC(y, m - 1, d + 3);
  const jan1 = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return 1 + Math.floor((thursday - jan1) / 86_400_000 / 7);
}

function weekLabel(monday) {
  const [y, m, d] = monday.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d + 6));
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `v. ${isoWeek(monday)} <span class="dim">(${d} ${months[m - 1]}–${end.getUTCDate()} ${months[end.getUTCMonth()]})</span>`;
}

function trend(now, before) {
  if (!before) return '';
  const pct = Math.round(((now - before) / before) * 100);
  const sign = pct > 0 ? '+' : '';
  return ` <span class="${pct >= 0 ? 'up' : 'down'}">${sign}${pct} %</span>`;
}

/**
 * @param {ReturnType<typeof import('./usage.mjs').weeklyStats>} weeks nyast först
 * @param {string} updated
 */
export function statsHtml(weeks, updated) {
  const current = weeks[0] || { week: '', users: 0, returning: 0, fresh: 0, comeback: 0, dailyAvg: 0, appShare: 0, opens: 0, opensApp: 0, actions: {} };
  const last = weeks[1];
  const goalPct = Math.min(100, Math.round((current.returning / GOAL_RETURNING) * 100));
  const max = Math.max(1, ...weeks.map((w) => w.users));
  const bars = weeks
    .slice(0, 12)
    .reverse()
    .map(
      (w) =>
        `<div class="bar" title="v. ${isoWeek(w.week)}: ${w.users} användare, ${w.returning} återkommande">` +
        `<div class="b-all" style="height:${Math.round((w.users / max) * 100)}%"><div class="b-ret" style="height:${w.users ? Math.round((w.returning / w.users) * 100) : 0}%"></div></div>` +
        `<span>${isoWeek(w.week)}</span></div>`
    )
    .join('');
  const rows = weeks
    .slice(0, 12)
    .map(
      (w) => `<tr><th scope="row">${weekLabel(w.week)}</th><td><b>${num(w.users)}</b></td><td>${num(w.returning)}</td><td>${num(w.fresh)}</td><td>${num(w.comeback)}</td><td>${String(w.dailyAvg).replace('.', ',')}</td><td>${w.appShare} %</td><td>${num(w.opens)}</td>${KEY_ACTIONS.map((k) => `<td>${num(w.actions[k])}</td>`).join('')}</tr>`
    )
    .join('');
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Statistik – alltid i tid</title>
<style>
:root{--bg:#f6f1ee;--fg:#1c1a19;--dim:#6d6764;--line:#ddd3ce;--card:#fff;--acc:#e0577a;--acc2:#f2b8c6;--up:#1d7a46;--down:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161413;--fg:#f3eeeb;--dim:#a39b97;--line:#38322f;--card:#211e1c;--acc:#f07a98;--acc2:#6b3443;--up:#6fd39a;--down:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 12px}.dim{color:var(--dim);font-weight:400}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0}
.tile{background:var(--card);border:1px solid var(--line);padding:12px 14px}.tile b{display:block;font-size:30px;line-height:1.1;font-variant-numeric:tabular-nums}.tile small{color:var(--dim)}
.up,.down{font-weight:600;white-space:nowrap}.up{color:var(--up)}.down{color:var(--down)}
.goal{background:var(--card);border:1px solid var(--line);padding:14px;margin:0 0 18px}.track{height:12px;background:var(--line);margin-top:8px}.fill{height:100%;background:var(--acc)}
.chart{display:flex;align-items:flex-end;gap:6px;height:140px;background:var(--card);border:1px solid var(--line);padding:12px 12px 26px;margin:0 0 18px}
.bar{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;position:relative}.bar span{position:absolute;bottom:-20px;left:0;right:0;text-align:center;font-size:12px;color:var(--dim)}
.b-all{background:var(--acc2);display:flex;flex-direction:column;justify-content:flex-end;min-height:1px}.b-ret{background:var(--acc)}
.scroll{overflow-x:auto;border:1px solid var(--line);background:var(--card)}table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th[scope=row],thead th:first-child{text-align:left}thead th{font-size:12px;color:var(--dim);font-weight:600;vertical-align:bottom;white-space:normal;min-width:70px}
.legend{font-size:13px;color:var(--dim);margin-top:14px}.legend i{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:-1px}
</style></head><body><main>
<h1>alltid i tid · statistik</h1>
<p class="dim">Uppdaterad ${esc(updated)} (svensk tid). Veckan går måndag till söndag.</p>
<div class="tiles">
<div class="tile"><small>Användare denna vecka</small><b>${num(current.users)}</b><small>${last ? `förra veckan ${num(last.users)}${trend(current.users, last.users)}` : '&nbsp;'}</small></div>
<div class="tile"><small>Återkommande denna vecka</small><b>${num(current.returning)}</b><small>var här även förra veckan</small></div>
<div class="tile"><small>Per dag i snitt</small><b>${String(current.dailyAvg).replace('.', ',')}</b><small>olika enheter</small></div>
<div class="tile"><small>Från hemskärmen</small><b>${current.appShare} %</b><small>av dagliga besök</small></div>
</div>
<div class="goal"><b>Mål för App Store-appen: ${num(GOAL_RETURNING)} återkommande i veckan</b> <span class="dim">· nu ${num(current.returning)} (${goalPct} %)</span><div class="track"><div class="fill" style="width:${goalPct}%"></div></div></div>
<div class="chart" role="img" aria-label="Användare per vecka">${bars}</div>
<div class="scroll"><table><thead><tr><th>Vecka</th><th>Användare</th><th>Åter&shy;kommande</th><th>Nya</th><th>Tillbaka efter paus</th><th>Per dag</th><th>Hem&shy;skärm</th><th>Öppningar</th>${KEY_ACTIONS.map((k) => `<th>${ACTION_NAMES[k]}</th>`).join('')}</tr></thead><tbody>${rows || '<tr><td colspan="15" style="text-align:left">Inga siffror än. De första kommer när någon öppnar en avgångstavla.</td></tr>'}</tbody></table></div>
<p class="legend"><i style="background:var(--acc)"></i>återkommande <i style="background:var(--acc2)"></i>övriga användare</p>
<p class="legend">En användare är en webbläsare som visat minst en avgångstavla den veckan. Samma person på telefon och dator räknas två gånger, och den som rensar webbläsaren räknas som ny. Automatiska webbläsare (tester, robotar) räknas inte. Mätningen startade 28 nov 2026. Inga id, kakor eller IP-adresser sparas, bara antal per dag. *Lagt på hemskärmen räknas bara på Android och dator; på iPhone syns det i kolumnen Hemskärm.</p>
</main></body></html>`;
}
