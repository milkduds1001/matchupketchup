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

/** De-duplicate a list of card names and drop any blank/empty entries. */
function uniqueNonEmptyNames(cardNames) {
  return [...new Set(cardNames)].filter((n) => n && String(n).trim())
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
  const names = uniqueNonEmptyNames(cardNames)
  for (const name of names) {
    const data = await fetchCardByName(name)
    onResult(name, data ? data.type_line : null)
    if (delayMs > 0) await delay(delayMs)
  }
}

/** One GET against the Scryfall "named" endpoint; null on any non-2xx response or network error. */
async function getScryfallNamed(param, cardName) {
  try {
    const url = `${SCRYFALL_NAMED_URL}?${param}=${encodeURIComponent(cardName)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

/**
 * Fetch full card JSON by exact name (for type_line, color_identity, legalities, etc.).
 * Falls back to Scryfall's fuzzy match if the exact lookup 404s — this also matches against a
 * card's localized/alternate *printed* name (e.g. a Universes Beyond crossover card whose
 * decklist/Arena name differs from Scryfall's canonical English `name`), which an exact match
 * against the printed name alone would otherwise miss entirely.
 * @returns {Promise<object|null>}
 */
async function fetchCardJsonByExactName(cardName) {
  if (!cardName || typeof cardName !== 'string') return null
  const trimmed = cardName.trim()
  if (!trimmed) return null
  const exact = await getScryfallNamed('exact', trimmed)
  if (exact) return exact
  return getScryfallNamed('fuzzy', trimmed)
}

/**
 * Fetch metadata for multiple card names (throttled). Callback receives (name, meta | null).
 * `meta` is the Scryfall card object when found.
 */
export async function fetchCardMetadata(cardNames, onResult, delayMs = DELAY_MS) {
  const names = uniqueNonEmptyNames(cardNames)
  for (const name of names) {
    const meta = await fetchCardJsonByExactName(name)
    onResult(name, meta)
    if (delayMs > 0) await delay(delayMs)
  }
}

/**
 * Best available image URL from a Scryfall card JSON object, or null. Falls back to the first
 * face's images for transform/modal-DFC cards, which have no top-level `image_uris`.
 */
export function pickCardImageUrl(data) {
  const uris = data?.image_uris || data?.card_faces?.[0]?.image_uris
  if (!uris || typeof uris !== 'object') return null
  // Prefer higher-res images to keep the preview crisp.
  return uris.large || uris.normal || uris.small || uris.png || null
}

/**
 * Small/normal image URL for preview, or null.
 */
export async function fetchCardImageUrlByName(cardName) {
  const data = await fetchCardJsonByExactName(cardName)
  return pickCardImageUrl(data)
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
