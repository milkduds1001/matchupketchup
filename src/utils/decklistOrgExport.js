/** Plain-text deck format suitable for pasting into https://decklist.org/ (MTGO-style lines). */

const MAIN = 'main'
const SIDEBOARD = 'sideboard'

function aggregateLines(cards, zone) {
  const map = new Map()
  for (const c of cards || []) {
    if (!c || typeof c !== 'object') continue
    const z = c.zone === SIDEBOARD ? SIDEBOARD : MAIN
    if (z !== zone) continue
    const name = String(c.name ?? '').trim()
    if (!name) continue
    const q = Math.max(0, Number.parseInt(String(c.quantity), 10) || Number(c.quantity) || 0)
    if (q <= 0) continue
    map.set(name, (map.get(name) || 0) + q)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
    .map(([name, qty]) => `${qty} ${name}`)
}

/**
 * @param {Array<{ name?: string, quantity?: number, zone?: string }>} cards
 * @returns {string} Main deck lines, blank line, then sideboard lines (if any).
 */
export function buildDecklistOrgPasteText(cards) {
  const mainLines = aggregateLines(cards, MAIN)
  const sideLines = aggregateLines(cards, SIDEBOARD)
  if (mainLines.length === 0 && sideLines.length === 0) return ''
  let out = mainLines.join('\n')
  if (sideLines.length > 0) {
    out += '\n\n' + sideLines.join('\n')
  }
  return out
}

export const DECKLIST_ORG_URL = 'https://decklist.org/'

/**
 * Copy formatted deck text and open decklist.org in a new tab.
 * @returns {Promise<'ok'|'empty'|'clipboard-failed'>}
 */
export async function copyDeckAndOpenDecklistOrg(cards) {
  const text = buildDecklistOrgPasteText(cards).trim()
  if (!text) return 'empty'
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return 'clipboard-failed'
  }
  window.open(DECKLIST_ORG_URL, '_blank', 'noopener,noreferrer')
  return 'ok'
}
