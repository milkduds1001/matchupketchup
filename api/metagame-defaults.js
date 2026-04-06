const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_ARCHETYPES_PER_FORMAT = 20

const GOLD_FISH_FORMAT_PATHS = {
  Standard: 'standard',
  Pioneer: 'pioneer',
  Modern: 'modern',
  Legacy: 'legacy',
}

const SNAPSHOT_WINDOWS = [
  { key: '7', label: 'Last 7 Days', period: '7' },
  { key: '14', label: 'Last 14 Days', period: '14' },
  { key: '30', label: 'Last 30 Days', period: '30' },
]

let memoryCache = null
let cacheUpdatedAt = 0

function emptyFormatsMap() {
  return {
    Standard: [],
    Pioneer: [],
    Modern: [],
    Legacy: [],
  }
}

function clampPercent(value) {
  const n = Number.parseFloat(String(value ?? '').replace('%', '').trim())
  if (Number.isNaN(n) || n < 0) return 0
  return Math.min(100, Number(n.toFixed(2)))
}

function normalizeDeckName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\(.*?\)\s*$/, '')
    .trim()
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function uniqueByName(archetypes) {
  const byName = new Map()
  for (const arch of archetypes) {
    const name = normalizeDeckName(arch?.name)
    const metagamePercent = clampPercent(arch?.metagamePercent)
    if (!name) continue
    const prev = byName.get(name)
    if (!prev || metagamePercent > prev.metagamePercent) {
      byName.set(name, { name, metagamePercent })
    }
  }
  return [...byName.values()].sort((a, b) => b.metagamePercent - a.metagamePercent)
}

function extractArchetypesFromHtml(html) {
  const tileMatches = []
  const tileRegex = /<div class=['"]archetype-tile['"][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi
  let tileMatch = tileRegex.exec(html)
  while (tileMatch) {
    const tileHtml = tileMatch[0]
    const nameMatch = tileHtml.match(/<a[^>]+href=['"]\/archetype\/[^'"]+#paper['"][^>]*>([^<]+)<\/a>/i)
    const pctMatch = tileHtml.match(
      /<div class=['"]archetype-tile-statistic[^'"]*metagame-percentage[^'"]*['"][\s\S]*?<div class=['"]archetype-tile-statistic-value['"][^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*%/i
    )
    if (nameMatch && pctMatch) {
      tileMatches.push({
        name: decodeHtmlEntities(nameMatch[1]),
        metagamePercent: clampPercent(pctMatch[1]),
      })
    }
    tileMatch = tileRegex.exec(html)
  }
  if (tileMatches.length > 0) {
    return uniqueByName(tileMatches).slice(0, MAX_ARCHETYPES_PER_FORMAT)
  }

  const rows = []
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch = rowRegex.exec(html)
  while (rowMatch) {
    const rowHtml = rowMatch[1]
    const nameMatch = rowHtml.match(/<a[^>]+href=['"]\/archetype\/[^'"]+['"][^>]*>([^<]+)<\/a>/i)
    const pctMatch = rowHtml.match(/([0-9]+(?:\.[0-9]+)?)\s*%/i)
    if (nameMatch && pctMatch) {
      rows.push({
        name: decodeHtmlEntities(nameMatch[1]),
        metagamePercent: clampPercent(pctMatch[1]),
      })
    }
    rowMatch = rowRegex.exec(html)
  }
  return uniqueByName(rows).slice(0, MAX_ARCHETYPES_PER_FORMAT)
}

/** Browser-like headers — some CDNs block non-browser UAs from serverless IPs (e.g. Vercel). */
const GOLDFISH_FETCH_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.mtggoldfish.com/',
}

async function fetchGoldfishMetagamePage(pathSlug) {
  const url = `https://www.mtggoldfish.com/metagame/${pathSlug}#paper`
  const response = await fetch(url, {
    headers: GOLDFISH_FETCH_HEADERS,
  })
  if (!response.ok) {
    throw new Error(`MTG Goldfish request failed (${response.status})`)
  }
  const html = await response.text()
  const csrfToken = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || ''
  const formToken = html.match(/name="authenticity_token" value="([^"]+)"/)?.[1] || ''
  const cookie = response.headers.get('set-cookie') || ''
  return { html, csrfToken, formToken, cookie }
}

async function fetchArchetypesForPeriodViaResort(pathSlug, period, bootstrap) {
  const body = new URLSearchParams({
    authenticity_token: bootstrap.formToken || bootstrap.csrfToken || '',
    period: String(period),
    mformat: String(pathSlug),
    subformat: '',
    page: '',
    type: 'paper',
  })
  const response = await fetch('https://www.mtggoldfish.com/metagame/re_sort', {
    method: 'POST',
    headers: {
      ...GOLDFISH_FETCH_HEADERS,
      accept: 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      'x-csrf-token': bootstrap.csrfToken || bootstrap.formToken || '',
      origin: 'https://www.mtggoldfish.com',
      referer: `https://www.mtggoldfish.com/metagame/${pathSlug}#paper`,
      cookie: bootstrap.cookie,
    },
    body: body.toString(),
  })
  if (!response.ok) {
    throw new Error(`MTG Goldfish re_sort failed (${response.status})`)
  }
  const html = await response.text()
  const archetypes = extractArchetypesFromHtml(html)
  if (archetypes.length === 0) {
    throw new Error(`No archetypes parsed`)
  }
  return archetypes
}

async function fetchFormatSnapshots(formatName, pathSlug) {
  const bootstrap = await fetchGoldfishMetagamePage(pathSlug)
  const periodResults = {}
  const periodErrors = []

  for (const window of SNAPSHOT_WINDOWS) {
    try {
      if (window.key === '30') {
        periodResults[window.key] = extractArchetypesFromHtml(bootstrap.html)
      } else {
        periodResults[window.key] = await fetchArchetypesForPeriodViaResort(pathSlug, window.period, bootstrap)
      }
      if (!Array.isArray(periodResults[window.key]) || periodResults[window.key].length === 0) {
        throw new Error('No archetypes parsed')
      }
    } catch (error) {
      periodResults[window.key] = []
      const msg = error instanceof Error ? error.message : String(error)
      periodErrors.push(`${window.label}: ${msg}`)
    }
  }

  return { formatName, periodResults, periodErrors }
}

function buildFallbackPayload() {
  const snapshots = {}
  for (const window of SNAPSHOT_WINDOWS) {
    snapshots[window.key] = {
      key: window.key,
      label: window.label,
      fetchedAt: new Date(0).toISOString(),
      formats: emptyFormatsMap(),
    }
  }
  return {
    source: 'MTG Goldfish',
    snapshotLabel: 'Last 30 Days',
    fetchedAt: new Date(0).toISOString(),
    snapshots,
    formats: snapshots['30'].formats,
  }
}

async function fetchFreshPayload() {
  const entries = Object.entries(GOLD_FISH_FORMAT_PATHS)
  const settled = await Promise.allSettled(
    entries.map(([formatName, pathSlug]) => fetchFormatSnapshots(formatName, pathSlug))
  )

  const snapshotByPeriod = {}
  for (const window of SNAPSHOT_WINDOWS) {
    snapshotByPeriod[window.key] = {
      key: window.key,
      label: window.label,
      fetchedAt: new Date().toISOString(),
      formats: emptyFormatsMap(),
    }
  }

  const failMessages = []
  settled.forEach((result, i) => {
    const formatName = entries[i][0]
    if (result.status === 'fulfilled') {
      for (const window of SNAPSHOT_WINDOWS) {
        snapshotByPeriod[window.key].formats[formatName] = result.value.periodResults[window.key] || []
      }
      for (const err of result.value.periodErrors) {
        failMessages.push(`${formatName} ${err}`)
      }
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
      failMessages.push(`${formatName}: ${msg}`)
    }
  })

  const anyData = SNAPSHOT_WINDOWS.some((window) =>
    Object.values(snapshotByPeriod[window.key].formats).some((list) => Array.isArray(list) && list.length > 0)
  )
  if (!anyData) {
    throw new Error(failMessages.join(' | ') || 'MTG Goldfish returned no archetypes for any format/period')
  }

  return {
    source: 'MTG Goldfish',
    snapshotLabel: 'Last 30 Days',
    fetchedAt: snapshotByPeriod['30'].fetchedAt,
    snapshots: snapshotByPeriod,
    // Backward compatibility for older clients.
    formats: snapshotByPeriod['30'].formats,
    ...(failMessages.length ? { warning: failMessages.join(' ') } : {}),
  }
}

/**
 * @param {{ bypassCache?: boolean }} [options]
 *   bypassCache — skip the 24h in-memory cache (used for explicit “Refresh MTG Goldfish” and ?refresh=1).
 */
export async function getMetagameDefaultsPayload(options = {}) {
  const bypassCache = Boolean(options.bypassCache)
  const now = Date.now()
  if (!bypassCache && memoryCache && now - cacheUpdatedAt < ONE_DAY_MS) {
    return { ...memoryCache, cached: true }
  }

  try {
    const fresh = await fetchFreshPayload()
    memoryCache = fresh
    cacheUpdatedAt = now
    return { ...fresh, cached: false }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Metagame feed unavailable'
    if (bypassCache) {
      return {
        ...buildFallbackPayload(),
        cached: false,
        unavailable: true,
        error: msg,
        refreshFailed: true,
      }
    }
    const safeFallback = memoryCache || buildFallbackPayload()
    return {
      ...safeFallback,
      cached: true,
      unavailable: true,
      error: msg,
    }
  }
}

/**
 * Vercel usually sets req.query; some Node runtimes only expose the raw path on req.url.
 */
function wantsRefreshBypass(req) {
  let v = req.query?.refresh ?? req.query?.nocache
  if (v == null && typeof req.url === 'string') {
    const qIndex = req.url.indexOf('?')
    if (qIndex >= 0) {
      const params = new URLSearchParams(req.url.slice(qIndex + 1))
      v = params.get('refresh') ?? params.get('nocache')
    }
  }
  const s = String(v ?? '').toLowerCase()
  return s === '1' || s === 'true'
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const bypassCache = wantsRefreshBypass(req)
  const payload = await getMetagameDefaultsPayload({ bypassCache })
  if (bypassCache) {
    res.setHeader('Cache-Control', 'private, no-store')
  } else {
    res.setHeader('Cache-Control', payload.unavailable ? 'public, max-age=300' : 'public, max-age=3600')
  }
  res.status(200).json(payload)
}
