/**
 * Cloudflare Pages Function — GET /api/metagame-defaults
 * @see https://developers.cloudflare.com/pages/functions/
 */
import { getMetagameDefaultsPayload } from '../../api/metagame-defaults.js'

export async function onRequestGet({ request }) {
  const url = new URL(request.url)
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
  return Response.json(payload, {
    headers: { 'Cache-Control': cacheControl },
  })
}
