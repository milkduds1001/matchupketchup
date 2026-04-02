const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_ARCHETYPES_PER_FORMAT = 20

const GOLD_FISH_FORMAT_PATHS = {
  Standard: 'standard',
  Pioneer: 'pioneer',
  Modern: 'modern',
  Legacy: 'legacy',
}

let memoryCache = null
let cacheUpdatedAt = 0

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

async function fetchFormatFromGoldfish(formatName, pathSlug) {
  const url = `https://www.mtggoldfish.com/metagame/${pathSlug}#paper`
  const response = await fetch(url, {
    headers: {
      'user-agent': 'MTG-SideboardGuide/1.0 (metagame defaults fetcher)',
      accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!response.ok) {
    throw new Error(`MTG Goldfish request failed for ${formatName} (${response.status})`)
  }
  const html = await response.text()
  const archetypes = extractArchetypesFromHtml(html)
  if (archetypes.length === 0) {
    throw new Error(`No archetypes parsed for ${formatName}`)
  }
  return archetypes
}

async function fetchFreshPayload() {
  const formats = {}
  for (const [formatName, pathSlug] of Object.entries(GOLD_FISH_FORMAT_PATHS)) {
    formats[formatName] = await fetchFormatFromGoldfish(formatName, pathSlug)
  }
  return {
    source: 'MTG Goldfish',
    snapshotLabel: 'Last 30 Days',
    fetchedAt: new Date().toISOString(),
    formats,
  }
}

function buildFallbackPayload() {
  return {
    source: 'MTG Goldfish',
    snapshotLabel: 'Last 30 Days',
    fetchedAt: new Date(0).toISOString(),
    formats: {
      Standard: [],
      Pioneer: [],
      Modern: [],
      Legacy: [],
    },
  }
}

export async function getMetagameDefaultsPayload() {
  const now = Date.now()
  if (memoryCache && now - cacheUpdatedAt < ONE_DAY_MS) {
    return { ...memoryCache, cached: true }
  }

  try {
    const fresh = await fetchFreshPayload()
    memoryCache = fresh
    cacheUpdatedAt = now
    return { ...fresh, cached: false }
  } catch (error) {
    const safeFallback = memoryCache || buildFallbackPayload()
    return {
      ...safeFallback,
      cached: true,
      unavailable: true,
      error: error instanceof Error ? error.message : 'Metagame feed unavailable',
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const payload = await getMetagameDefaultsPayload()
  res.setHeader('Cache-Control', payload.unavailable ? 'public, max-age=300' : 'public, max-age=3600')
  res.status(200).json(payload)
}
