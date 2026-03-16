/**
 * Scryfall API helpers for fetching card data (e.g. type_line).
 * See https://scryfall.com/docs/api
 * Please respect rate limits (e.g. ~10 requests per second max).
 */

const SCRYFALL_NAMED_URL = 'https://api.scryfall.com/cards/named'
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
  if (!cardName || typeof cardName !== 'string') return null
  const trimmed = cardName.trim()
  if (!trimmed) return null
  try {
    const url = `${SCRYFALL_NAMED_URL}?exact=${encodeURIComponent(trimmed)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return data && typeof data.type_line === 'string' ? { type_line: data.type_line } : null
  } catch {
    return null
  }
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
