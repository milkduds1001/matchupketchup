/**
 * Scryfall API helpers for fetching card data (e.g. type_line).
 * See https://scryfall.com/docs/api
 * Please respect rate limits (e.g. ~10 requests per second max).
 */

const SCRYFALL_NAMED_URL = 'https://api.scryfall.com/cards/named'
const SCRYFALL_SEARCH_URL = 'https://api.scryfall.com/cards/search'
const DELAY_MS = 100

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch a single card by exact name; returns type_line or null.
 * @param {string} cardName - Exact card name
 * @returns {Promise<{ type_line: string } | null>}
 */
export async function fetchCardByName(cardName) {
  const data = await fetchCardJsonByExactName(cardName)
  return data && typeof data.type_line === 'string' ? { type_line: data.type_line } : null
}

/**
 * Fetch type_line for multiple card names, with throttling.
 * @param {string[]} cardNames - Unique card names
 * @param {function(string, string|null): void} onResult - Callback(name, type_line | null) for each result
 * @param {number} delayMs - Delay between requests (default 100)
 */
export async function fetchCardTypes(cardNames, onResult, delayMs = DELAY_MS) {
  const names = [...new Set(cardNames)].filter((n) => n && String(n).trim())
  for (const name of names) {
    const data = await fetchCardByName(name)
    onResult(name, data ? data.type_line : null)
    if (delayMs > 0) await delay(delayMs)
  }
}

/**
 * Fetch full card JSON by exact name (for type_line, color_identity, legalities, etc.).
 * @returns {Promise<object|null>}
 */
async function fetchCardJsonByExactName(cardName) {
  if (!cardName || typeof cardName !== 'string') return null
  const trimmed = cardName.trim()
  if (!trimmed) return null
  try {
    const url = `${SCRYFALL_NAMED_URL}?exact=${encodeURIComponent(trimmed)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

/**
 * Fetch metadata for multiple card names (throttled). Callback receives (name, meta | null).
 * `meta` is the Scryfall card object when found.
 */
export async function fetchCardMetadata(cardNames, onResult, delayMs = DELAY_MS) {
  const names = [...new Set(cardNames)].filter((n) => n && String(n).trim())
  for (const name of names) {
    const meta = await fetchCardJsonByExactName(name)
    onResult(name, meta)
    if (delayMs > 0) await delay(delayMs)
  }
}

/**
 * Small/normal image URL for preview, or null.
 */
export async function fetchCardImageUrlByName(cardName) {
  const data = await fetchCardJsonByExactName(cardName)
  if (!data?.image_uris || typeof data.image_uris !== 'object') return null
  const uris = data.image_uris
  // Prefer higher-res images to keep the preview crisp.
  return uris.large || uris.normal || uris.small || uris.png || null
}

/**
 * Search Scryfall for cards; returns minimal objects for the deck editor list.
 */
export async function searchCardsByName(query) {
  const q = String(query || '').trim()
  if (!q) return []
  try {
    const url = `${SCRYFALL_SEARCH_URL}?q=${encodeURIComponent(q)}&unique=cards`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    if (!data || !Array.isArray(data.data)) return []
    return data.data.map((c) => ({
      id: c.id,
      name: c.name,
      type_line: typeof c.type_line === 'string' ? c.type_line : '',
    }))
  } catch {
    return []
  }
}
