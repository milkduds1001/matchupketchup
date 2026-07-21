/**
 * Fetches MTG Goldfish "metagame defaults" (archetype name + metagame %, per format, per
 * 7/14/30-day window) and normalizes whatever shape comes back — from the live /api endpoint,
 * a pre-built static JSON snapshot, or a partially-formed legacy payload — into one consistent
 * shape the rest of the app can rely on.
 *
 * Relationship to the other two files in this trio: syncGoldfishDefaults.js calls
 * fetchMetagameDefaults/getDefaultsForFormat here to pull a format's Goldfish snapshot and
 * hands the result to storage.js's applyLockedGoldfishDefaults, which merges it into a user's
 * metagame grid (the archetype list matchupKeys.js's keys are built against). This file only
 * fetches/normalizes/reshapes Goldfish data — it never reads or writes user-edited grids.
 */

const SUPPORTED_FORMATS = new Set(['Standard', 'Pioneer', 'Modern', 'Legacy'])
const SUPPORTED_WINDOWS = ['7', '14', '30']

// ---------------------------------------------------------------------------
// Archetype list normalization
// ---------------------------------------------------------------------------

/** Parses a percent value that may be a number, a numeric string, or `"NN%"`; clamps to 0–100. */
function clampPercent(value) {
  const n = Number.parseFloat(String(value ?? '').replace('%', '').trim())
  if (Number.isNaN(n) || n < 0) return 0
  return Math.min(100, Number(n.toFixed(2)))
}

/** Coerces one raw archetype entry to `{ name, metagamePercent }`, or null if it has no name. */
function normalizeArchetype(item) {
  const name = String(item?.name ?? '').trim()
  if (!name) return null
  return {
    name,
    metagamePercent: clampPercent(item?.metagamePercent),
  }
}

/** Normalizes a format's archetype list: drops unnamed entries, dedupes by lowercased name (first occurrence wins), sorts by metagame % descending. */
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

// ---------------------------------------------------------------------------
// Full payload normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw defaults payload (from the API or a static snapshot) into a fixed shape:
 * archetypes per SUPPORTED_FORMATS, further split into per-SUPPORTED_WINDOWS snapshots.
 * Also backfills the 30-day snapshot from `raw.formats` for legacy payloads that predate the
 * 7/14/30-day snapshot split and only ever had a single (implicitly 30-day) archetype list.
 */
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

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/** Vite's `BASE_URL` with any trailing slash stripped, or '' at domain root — shared by both URL builders below so /api and the static snapshot both work when the app is hosted under a sub-path. */
function getBaseRoot() {
  const base = import.meta.env.BASE_URL || '/'
  return base === '/' ? '' : base.replace(/\/$/, '')
}

/** Respects Vite `base` so /api works when the app is not hosted at domain root. */
export function getMetagameDefaultsFetchUrl(queryString = '') {
  const q = queryString && !queryString.startsWith('?') ? `?${queryString}` : queryString
  return `${getBaseRoot()}/api/metagame-defaults${q}`
}

/** URL of the pre-built static JSON snapshot committed for hosts with no serverless /api (see fetchStaticMetagameDefaultsSnapshot). */
function getStaticMetagameDefaultsUrl() {
  return `${getBaseRoot()}/metagame-defaults.json`
}

// ---------------------------------------------------------------------------
// Fetching, with static-snapshot fallback for hosts without a working /api
// ---------------------------------------------------------------------------

/**
 * Fallback used when /api/metagame-defaults is unavailable (static-only hosting, network
 * error, or a dev server not proxying /api yet): loads the static JSON file built at
 * deploy/build time instead of a live scrape. Marks the result `fromStaticSnapshot` so the UI
 * can indicate the data may be stale.
 */
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

/**
 * True when the /api response can't actually be the defaults API and we should retry against
 * the static snapshot instead. Covers a plain 404, and the common static-hosting footgun where
 * there's no serverless function at all and the host's SPA fallback rewrite serves index.html
 * with a 200 status for any unmatched path (so `response.ok` alone isn't a reliable signal).
 */
function apiResponseNeedsStaticFallback(response, text) {
  if (response.status === 404) return true
  const ct = String(response.headers.get('content-type') || '').toLowerCase()
  const t = text.trimStart()
  const htmlish = t.toLowerCase().startsWith('<!') || t.toLowerCase().startsWith('<html')
  if (response.ok && htmlish) return true
  if (response.ok && ct.includes('text/html')) return true
  return false
}

/**
 * Parses a successful-looking /api response body. Throws the sentinel message `'HTML_RESPONSE'`
 * when the body is HTML despite a 2xx status (same SPA-rewrite case apiResponseNeedsStaticFallback
 * guards against, but discovered only after content-type/body inspection here) — callers match on
 * that exact message to decide whether to retry against the static snapshot.
 */
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
 * Fetches the current metagame defaults, falling back to the static snapshot (see
 * fetchStaticMetagameDefaultsSnapshot) in three places when `refresh` is false: on a network
 * error, when apiResponseNeedsStaticFallback flags a static-hosting SPA rewrite, and when the
 * body turns out to be HTML (the 'HTML_RESPONSE' sentinel from parseMetagameDefaultsApiResponse).
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

// ---------------------------------------------------------------------------
// Per-format view
// ---------------------------------------------------------------------------

/** Reshapes a normalized (or raw — it re-normalizes) payload down to one format's archetypes plus its 7/14/30-day snapshots; falls back to 'Standard' for an unrecognized/missing formatName. */
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
