// Körs före varje förfrågan till Cloudflare Pages.
//
// 1. resx.se (kortdomänen) skickas vidare till alltiditid.se med samma sökväg
//    och parametrar, så att resx.se/?h=740021705&n=Gullmarsplan fungerar.
// 2. En delad hållplatslänk (/?h=…&n=…) får hållplatsens namn i titeln och i
//    delningstexten, så att förhandsvisningen i Messenger, iMessage och Slack
//    visar "Gullmarsplan" i stället för en allmän rubrik. Länkförhandsvisare
//    kör inget JavaScript, därför görs det här och inte i appen.

const SHORT_HOSTS = new Set(['resx.se', 'www.resx.se']);
const SITE = 'https://alltiditid.se';

function stopFromUrl(url) {
  const id = (url.searchParams.get('h') || '').trim();
  if (!/^\d{6,12}(,\d{6,12}){0,3}$/.test(id)) return null;
  const name = (url.searchParams.get('n') || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (!name) return null;
  return { id, name, arrivals: url.searchParams.get('visa') === 'ankomster' };
}

class SetContent {
  constructor(value) {
    this.value = value;
  }
  element(el) {
    el.setInnerContent(this.value);
  }
}

class SetAttr {
  constructor(value) {
    this.value = value;
  }
  element(el) {
    el.setAttribute('content', this.value);
  }
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (SHORT_HOSTS.has(url.hostname)) {
    return Response.redirect(`${SITE}${url.pathname}${url.search}`, 301);
  }

  const response = await context.next();
  if (request.method !== 'GET' || url.pathname !== '/') return response;
  const stop = stopFromUrl(url);
  if (!stop) return response;
  if (!(response.headers.get('Content-Type') || '').includes('text/html')) return response;

  const what = stop.arrivals ? 'Ankomster' : 'Avgångar';
  const title = `${stop.name} – ${what.toLowerCase()} i realtid | alltid i tid`;
  const description = `${what} från ${stop.name} i realtid, med förseningar och störningar. Utan reklam, utan konto.`;
  const shareUrl = `${SITE}/?h=${encodeURIComponent(stop.id)}&n=${encodeURIComponent(stop.name)}${
    stop.arrivals ? '&visa=ankomster' : ''
  }`;

  return new HTMLRewriter()
    .on('title', new SetContent(title))
    .on('meta[name="description"]', new SetAttr(description))
    .on('meta[property="og:title"]', new SetAttr(`${stop.name} – ${what.toLowerCase()} i realtid`))
    .on('meta[property="og:description"]', new SetAttr(description))
    .on('meta[property="og:url"]', new SetAttr(shareUrl))
    .on('meta[name="twitter:title"]', new SetAttr(`${stop.name} – ${what.toLowerCase()} i realtid`))
    .on('meta[name="twitter:description"]', new SetAttr(description))
    .transform(response);
}
