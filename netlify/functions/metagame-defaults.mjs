import { getMetagameDefaultsPayload } from '../../api/metagame-defaults.js'

/** Netlify Function (ESM) — proxied as GET /api/metagame-defaults via netlify.toml */
export default async function handler(request) {
  const raw = request.url || '/'
  const url = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://example.internal')
  const bypassCache =
    url.searchParams.get('refresh') === '1' ||
    url.searchParams.get('refresh') === 'true' ||
    url.searchParams.get('nocache') === '1'
  const payload = await getMetagameDefaultsPayload({ bypassCache })
  const cacheControl = bypassCache
    ? 'private, no-store'
    : payload.unavailable
      ? 'public, max-age=300'
      : 'public, max-age=3600'
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    },
  })
}
