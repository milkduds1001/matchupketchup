/**
 * Cloudflare Pages Function — GET /api/metagame-defaults
 * @see https://developers.cloudflare.com/pages/functions/
 */
import { getMetagameDefaultsPayload } from '../../api/metagame-defaults.js'

export async function onRequestGet() {
  const payload = await getMetagameDefaultsPayload()
  const cacheControl = payload.unavailable ? 'public, max-age=300' : 'public, max-age=3600'
  return Response.json(payload, {
    headers: { 'Cache-Control': cacheControl },
  })
}
