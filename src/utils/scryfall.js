/**
 * Scryfall API helpers for fetching card data (e.g. type_line).
 * See https://scryfall.com/docs/api
 * Please respect rate limits (e.g. ~10 requests per second max).
 */

const SCRYFALL_NAMED_URL = 'https://api.scryfall.com/cards/named'
const SCRYFALL_SEARCH_URL = 'https://api.scryfall.com/cards/search'
const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection'
const DELAY_MS = 100
const COLLECTION_BATCH_SIZE = 75
const COLLECTION_BATCH_DELAY_MS = 550

/** Scryfall requires Accept on every API request (browser fetch already sends User-Agent). */
const SCRYFALL_JSON_HEADERS = {
  Accept: 'application/json;q=0.9,*/*;q=0.8',
}

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

async function scryfallJsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...SCRYFALL_JSON_HEADERS,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data && typeof data === 'object' ? data : null
}

/** One GET against the Scryfall "named" endpoint; null on any non-2xx response or network error. */
async function getScryfallNamed(param, cardName) {
  try {
    const url = `${SCRYFALL_NAMED_URL}?${param}=${encodeURIComponent(cardName)}`
    return await scryfallJsonFetch(url)
  } catch {
    return null
  }
}

function cardNameCandidates(card) {
  const names = [card?.name, card?.printed_name]
  for (const face of Array.isArray(card?.card_faces) ? card.card_faces : []) {
    names.push(face?.name, face?.printed_name)
  }
  return names.filter((n) => typeof n === 'string' && n.trim())
}

function normalizeCardName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\/\/\s*/g, ' // ')
}

function cardMatchesRequestedName(card, requestedName) {
  const want = normalizeCardName(requestedName)
  if (!want) return false
  const candidates = cardNameCandidates(card).map(normalizeCardName)
  if (candidates.includes(want)) return true
  const wantFront = want.split(' // ')[0]
  return candidates.some((n) => n === wantFront || n.split(' // ')[0] === want)
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
  // Stacks are ~140px wide; `normal` is plenty and much cheaper than `large` for a full deck.
  return uris.normal || uris.large || uris.small || uris.png || null
}

/**
 * Direct image redirect URL. Useful as an <img> fallback if JSON lookup fails; the browser
 * request sends image Accept headers, which Scryfall allows.
 */
export function namedCardImageUrl(cardName, version = 'normal') {
  const trimmed = String(cardName || '').trim()
  if (!trimmed) return null
  return `${SCRYFALL_NAMED_URL}?fuzzy=${encodeURIComponent(trimmed)}&format=image&version=${encodeURIComponent(version)}`
}

async function fetchCollectionByNames(names) {
  const identifiers = names.map((name) => ({ name }))
  try {
    return await scryfallJsonFetch(SCRYFALL_COLLECTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers }),
    })
  } catch {
    return null
  }
}

function assignCollectionResults(requestedNames, listPayload) {
  const found = Array.isArray(listPayload?.data) ? [...listPayload.data] : []
  const assigned = {}
  const unmatched = []
  for (const requested of requestedNames) {
    const idx = found.findIndex((card) => cardMatchesRequestedName(card, requested))
    if (idx < 0) {
      unmatched.push(requested)
      continue
    }
    const [card] = found.splice(idx, 1)
    assigned[requested] = pickCardImageUrl(card) || namedCardImageUrl(requested)
  }
  return { assigned, unmatched }
}

// How many individual named-card lookups to run at once when a name misses the bulk collection
// match (e.g. a recent/crossover printing whose decklist name doesn't exact-match Scryfall's).
// Sequentially, one name every ~100ms+latency, a deck with two dozen such misses could take
// 10-20+ seconds to finish — long enough that a card sitting further back in the queue looks
// permanently stuck unless you hover it (which fires an immediate, unqueued lookup for just that
// one). Resolving a handful at once instead closes that gap for everyone, not just whichever card
// you happen to hover.
const UNMATCHED_LOOKUP_CONCURRENCY = 6

/** Resolve `names` (already known to need an individual named-card lookup) into `urls`, a handful at a time. */
async function resolveNamesIndividually(names, urls) {
  for (let i = 0; i < names.length; i += UNMATCHED_LOOKUP_CONCURRENCY) {
    const chunk = names.slice(i, i + UNMATCHED_LOOKUP_CONCURRENCY)
    await Promise.all(
      chunk.map(async (name) => {
        const data = await fetchCardJsonByExactName(name)
        const url = pickCardImageUrl(data)
        urls[name] = url || namedCardImageUrl(name)
      })
    )
    if (i + UNMATCHED_LOOKUP_CONCURRENCY < names.length) await delay(DELAY_MS)
  }
}

/**
 * Resolve image URLs for many decklist names in bulk (Scryfall collection, 75/request).
 * Values: CDN URL string, or `null` when Scryfall confirmed the name is not a card.
 * Names omitted from the returned object were not resolved (network/rate-limit) and should be retried.
 */
export async function fetchCardImageUrlsByNames(cardNames) {
  const names = uniqueNonEmptyNames(cardNames).map((n) => String(n).trim())
  const urls = {}
  for (let i = 0; i < names.length; i += COLLECTION_BATCH_SIZE) {
    if (i > 0) await delay(COLLECTION_BATCH_DELAY_MS)
    const batch = names.slice(i, i + COLLECTION_BATCH_SIZE)
    const payload = await fetchCollectionByNames(batch)
    if (!payload) {
      // Collection POST failed (CORS/network). Fall back to named lookups per card.
      await resolveNamesIndividually(batch, urls)
      continue
    }
    const { assigned, unmatched } = assignCollectionResults(batch, payload)
    Object.assign(urls, assigned)
    await resolveNamesIndividually(unmatched, urls)
  }
  return urls
}

/**
 * Small/normal image URL for preview, or a named-image redirect if JSON has no art.
 */
export async function fetchCardImageUrlByName(cardName) {
  const data = await fetchCardJsonByExactName(cardName)
  return pickCardImageUrl(data) || namedCardImageUrl(cardName)
}

/**
 * Search Scryfall for cards; returns minimal objects for the deck editor list.
 */
export async function searchCardsByName(query) {
  const q = String(query || '').trim()
  if (!q) return []
  try {
    const url = `${SCRYFALL_SEARCH_URL}?q=${encodeURIComponent(q)}&unique=cards`
    const data = await scryfallJsonFetch(url)
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
