import { getMetagameDefaultsPayload } from '../../api/metagame-defaults.js'

/** Netlify Function (ESM) — proxied as GET /api/metagame-defaults via netlify.toml */
export default async function handler() {
  const payload = await getMetagameDefaultsPayload()
  const cacheControl = payload.unavailable ? 'public, max-age=300' : 'public, max-age=3600'
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    },
  })
}
