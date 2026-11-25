const TROMSO_REGION_ID = 3011;

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const dayKey = url.searchParams.get('dayKey') || '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return new Response(JSON.stringify({ error: 'Invalid dayKey' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = `https://api01.nve.no/hydrology/forecast/avalanche/v6.3.0/api/AvalancheWarningByRegion/Detail/${TROMSO_REGION_ID}/2/${dayKey}/${dayKey}`;

  const res = await fetch(upstream, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: 900, cacheEverything: true },
  });

  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
