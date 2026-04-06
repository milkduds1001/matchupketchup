const SUPPORTED_FORMATS = new Set(['Standard', 'Pioneer', 'Modern', 'Legacy'])
const SUPPORTED_WINDOWS = ['7', '14', '30']

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
  const snapshots = {}
  for (const key of SUPPORTED_WINDOWS) {
    const rawSnapshot = raw?.snapshots?.[key]
    const snapshotFormats = {}
    for (const formatName of SUPPORTED_FORMATS) {
      snapshotFormats[formatName] = normalizeFormatArchetypes(rawSnapshot?.formats?.[formatName])
    }
    snapshots[key] = {
      key,
      label: String(rawSnapshot?.label || `Last ${key} Days`),
      fetchedAt: String(rawSnapshot?.fetchedAt || raw?.fetchedAt || ''),
      formats: snapshotFormats,
    }
  }
  // Backfill snapshots from legacy payloads that only provide 30-day formats.
  if (Object.values(snapshots['30'].formats).every((list) => list.length === 0)) {
    for (const formatName of SUPPORTED_FORMATS) {
      snapshots['30'].formats[formatName] = [...formats[formatName]]
    }
  }
  return {
    source: String(raw?.source || 'MTG Goldfish'),
    snapshotLabel: String(raw?.snapshotLabel || 'Last 30 Days'),
    fetchedAt: String(raw?.fetchedAt || ''),
    cached: Boolean(raw?.cached),
    unavailable: Boolean(raw?.unavailable),
    error: raw?.error ? String(raw.error) : '',
    warning: raw?.warning ? String(raw.warning) : '',
    /** True when data came from /metagame-defaults.json (static host / no API). */
    fromStaticSnapshot: Boolean(raw?.fromStaticSnapshot),
    formats,
    snapshots,
  }
}

/** Respects Vite `base` so /api works when the app is not hosted at domain root. */
export function getMetagameDefaultsFetchUrl(queryString = '') {
  const base = import.meta.env.BASE_URL || '/'
  const root = base === '/' ? '' : base.replace(/\/$/, '')
  const q = queryString && !queryString.startsWith('?') ? `?${queryString}` : queryString
  return `${root}/api/metagame-defaults${q}`
}

function getStaticMetagameDefaultsUrl() {
  const base = import.meta.env.BASE_URL || '/'
  const root = base === '/' ? '' : base.replace(/\/$/, '')
  return `${root}/metagame-defaults.json`
}

async function fetchStaticMetagameDefaultsSnapshot() {
  const response = await fetch(getStaticMetagameDefaultsUrl(), {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Static snapshot HTTP ${response.status}`)
  }
  const ct = String(response.headers.get('content-type') || '').toLowerCase()
  const jsonLike = ct.includes('application/json') || text.trimStart().startsWith('{')
  if (!jsonLike) {
    throw new Error('Static snapshot is not JSON')
  }
  const raw = JSON.parse(text)
  return normalizeMetagameDefaultsPayload({ ...raw, fromStaticSnapshot: true })
}

function apiResponseNeedsStaticFallback(response, text) {
  if (response.status === 404) return true
  const ct = String(response.headers.get('content-type') || '').toLowerCase()
  const t = text.trimStart()
  const htmlish = t.toLowerCase().startsWith('<!') || t.toLowerCase().startsWith('<html')
  if (response.ok && htmlish) return true
  if (response.ok && ct.includes('text/html')) return true
  return false
}

function parseMetagameDefaultsApiResponse(response, text) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (!response.ok) {
    let detail = ''
    if (contentType.includes('application/json')) {
      try {
        const errBody = JSON.parse(text)
        if (errBody?.error) detail = ` — ${errBody.error}`
      } catch {
        /* ignore */
      }
    }
    throw new Error(`Defaults fetch failed (${response.status})${detail}`)
  }
  if (!contentType.includes('application/json')) {
    const trimmed = text.trimStart()
    if (trimmed.startsWith('<')) {
      throw new Error('HTML_RESPONSE')
    }
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

/**
 * @param {{ refresh?: boolean }} [options]
 *   refresh — force a new scrape (skips server 24h memory cache); use for “Refresh MTG Goldfish”.
 *   On static-only hosts, refresh still calls the API; if missing, throws (snapshot cannot update in-browser).
 */
export async function fetchMetagameDefaults(options = {}) {
  const refresh = Boolean(options.refresh)
  const qs = refresh ? '?refresh=1' : ''
  const url = getMetagameDefaultsFetchUrl(qs)

  let response
  let text
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    })
    text = await response.text()
  } catch (networkErr) {
    if (!refresh) {
      try {
        return await fetchStaticMetagameDefaultsSnapshot()
      } catch {
        /* fall through */
      }
    }
    const msg = networkErr instanceof Error ? networkErr.message : 'Network error'
    throw new Error(`Could not reach metagame API: ${msg}`)
  }

  if (!refresh && apiResponseNeedsStaticFallback(response, text)) {
    try {
      return await fetchStaticMetagameDefaultsSnapshot()
    } catch (staticErr) {
      const hint = staticErr instanceof Error ? staticErr.message : String(staticErr)
      throw new Error(
        `No working /api/metagame-defaults (HTTP ${response.status}) and static snapshot failed: ${hint}. Run npm run build (with network) or deploy with Vercel/Netlify/Cloudflare per docs/DEPLOYMENT.md.`
      )
    }
  }

  try {
    return parseMetagameDefaultsApiResponse(response, text)
  } catch (e) {
    if (!refresh && e instanceof Error && e.message === 'HTML_RESPONSE') {
      try {
        return await fetchStaticMetagameDefaultsSnapshot()
      } catch (staticErr) {
        const hint = staticErr instanceof Error ? staticErr.message : String(staticErr)
        throw new Error(
          `Metagame API returned HTML (typical on static-only hosting). Static snapshot failed: ${hint}.`
        )
      }
    }
    throw e
  }
}

export function getDefaultsForFormat(payload, formatName) {
  const normalized = normalizeMetagameDefaultsPayload(payload)
  const key = SUPPORTED_FORMATS.has(String(formatName)) ? formatName : 'Standard'
  const snapshotByWindow = {}
  for (const windowKey of SUPPORTED_WINDOWS) {
    snapshotByWindow[windowKey] = {
      key: windowKey,
      label: normalized.snapshots[windowKey]?.label || `Last ${windowKey} Days`,
      fetchedAt: normalized.snapshots[windowKey]?.fetchedAt || normalized.fetchedAt,
      archetypes: normalized.snapshots[windowKey]?.formats?.[key] || [],
    }
  }
  return {
    source: normalized.source,
    snapshotLabel: normalized.snapshotLabel,
    fetchedAt: normalized.fetchedAt,
    cached: normalized.cached,
    unavailable: normalized.unavailable,
    error: normalized.error,
    warning: normalized.warning,
    fromStaticSnapshot: normalized.fromStaticSnapshot,
    archetypes: normalized.formats[key],
    snapshots: snapshotByWindow,
  }
}
