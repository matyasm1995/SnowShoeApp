const MET_USER_AGENT = 'TOGuides/1.7.0 (https://github.com/matyasm1995/SnowShoeApp; guide@tromsooutdoor.no)';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const lang = url.searchParams.get('lang') || 'en';

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'Missing lat/lon' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = new URL('https://api.met.no/weatherapi/metalerts/2.0/current.json');
  upstream.searchParams.set('lat', lat);
  upstream.searchParams.set('lon', lon);
  upstream.searchParams.set('lang', lang);

  const res = await fetch(upstream.toString(), {
    headers: {
      'User-Agent': MET_USER_AGENT,
      Accept: 'application/json',
    },
    cf: { cacheTtl: 300, cacheEverything: true },
  });

  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
