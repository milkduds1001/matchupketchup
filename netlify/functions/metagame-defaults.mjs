import { getMetagameDefaultsPayload } from '../../api/metagame-defaults.js'

export default async function handler() {
  const payload = await getMetagameDefaultsPayload()
  const cacheControl = payload.unavailable ? 'public, max-age=300' : 'public, max-age=3600'
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    },
    body: JSON.stringify(payload),
  }
}
