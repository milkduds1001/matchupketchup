const SUPPORTED_FORMATS = new Set(['Standard', 'Pioneer', 'Modern', 'Legacy'])

function clampPercent(value) {
  const n = Number.parseFloat(String(value ?? '').replace('%', '').trim())
  if (Number.isNaN(n) || n < 0) return 0
  return Math.min(100, Number(n.toFixed(2)))
}

function normalizeArchetype(item) {
  const name = String(item?.name ?? '').trim()
  if (!name) return null
  return {
    name,
    metagamePercent: clampPercent(item?.metagamePercent),
  }
}

function normalizeFormatArchetypes(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const normalized = normalizeArchetype(item)
    if (!normalized) continue
    const key = normalized.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out.sort((a, b) => b.metagamePercent - a.metagamePercent)
}

export function normalizeMetagameDefaultsPayload(raw) {
  const formats = {}
  for (const formatName of SUPPORTED_FORMATS) {
    formats[formatName] = normalizeFormatArchetypes(raw?.formats?.[formatName])
  }
  return {
    source: String(raw?.source || 'MTG Goldfish'),
    snapshotLabel: String(raw?.snapshotLabel || 'Last 30 Days'),
    fetchedAt: String(raw?.fetchedAt || ''),
    cached: Boolean(raw?.cached),
    unavailable: Boolean(raw?.unavailable),
    error: raw?.error ? String(raw.error) : '',
    formats,
  }
}

/**
 * @param {{ refresh?: boolean }} [options]
 *   refresh — force a new scrape (skips server 24h memory cache); use for “Refresh MTG Goldfish”.
 */
export async function fetchMetagameDefaults(options = {}) {
  const qs = options.refresh ? '?refresh=1' : ''
  const response = await fetch(`/api/metagame-defaults${qs}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Defaults fetch failed (${response.status})`)
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  const text = await response.text()
  if (!contentType.includes('application/json')) {
    throw new Error('Metagame defaults endpoint returned non-JSON data. Restart dev server and try again.')
  }
  let payload = null
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('Metagame defaults endpoint returned invalid JSON.')
  }
  return normalizeMetagameDefaultsPayload(payload)
}

export function getDefaultsForFormat(payload, formatName) {
  const normalized = normalizeMetagameDefaultsPayload(payload)
  const key = SUPPORTED_FORMATS.has(String(formatName)) ? formatName : 'Standard'
  return {
    source: normalized.source,
    snapshotLabel: normalized.snapshotLabel,
    fetchedAt: normalized.fetchedAt,
    cached: normalized.cached,
    unavailable: normalized.unavailable,
    error: normalized.error,
    archetypes: normalized.formats[key],
  }
}
