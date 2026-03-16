/**
 * CSV export for the matchup table.
 *
 * How the CSV is generated:
 * 1. Header row: "Card", "Qty", "Type", "Group", then one column per archetype (archetype names).
 * 2. One data row per card: card name, quantity, type_line, group bucket, then archetype values.
 * 3. Fields that contain a comma, newline, or double-quote are wrapped in double quotes,
 *    and any double quotes inside are escaped as "" (RFC 4180-style).
 */

function escapeCsvField(value) {
  const str = String(value ?? '')
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const CARD_GROUP_CREATURES_PLANESWALKERS = 'Creatures & Planeswalkers'
const CARD_GROUP_OTHER_SPELLS = 'Other Spells'
const CARD_GROUP_LANDS = 'Lands'
// Display/export order: Creatures & Planeswalkers, then Other Spells, then Lands
const GROUP_SORT_ORDER = [
  CARD_GROUP_CREATURES_PLANESWALKERS,
  CARD_GROUP_OTHER_SPELLS,
  CARD_GROUP_LANDS,
]
const GROUP_ORDER_MAP = Object.fromEntries(GROUP_SORT_ORDER.map((g, i) => [g, i]))

function getCardGroup(typeLine) {
  if (!typeLine || typeof typeLine !== 'string') return CARD_GROUP_OTHER_SPELLS
  const lower = typeLine.toLowerCase()
  if (lower.includes('land')) return CARD_GROUP_LANDS
  if (lower.includes('creature') || lower.includes('planeswalker')) return CARD_GROUP_CREATURES_PLANESWALKERS
  return CARD_GROUP_OTHER_SPELLS
}

const TYPE_SORT_ORDER = ['Land', 'Creature', 'Planeswalker', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Tribal']
const TYPE_ORDER_MAP = Object.fromEntries(TYPE_SORT_ORDER.map((t, i) => [t, i]))

function getTypeSortKey(typeLine) {
  if (!typeLine || typeof typeLine !== 'string') return [TYPE_SORT_ORDER.length, '']
  const mainPart = typeLine.split(/\s*[—\-]\s*/)[0].trim()
  const types = mainPart ? mainPart.split(/\s+/) : []
  const primary = types.find((t) => TYPE_ORDER_MAP[t] !== undefined) || types[0] || ''
  const rank = TYPE_ORDER_MAP[primary] ?? TYPE_SORT_ORDER.length
  return [rank, typeLine]
}

function sortCardsForExport(cards, cardTypes = {}) {
  return [...cards].sort((a, b) => {
    const typeA = cardTypes[a?.name]
    const typeB = cardTypes[b?.name]
    const groupA = getCardGroup(typeA)
    const groupB = getCardGroup(typeB)
    const groupRankA = GROUP_ORDER_MAP[groupA] ?? GROUP_SORT_ORDER.length
    const groupRankB = GROUP_ORDER_MAP[groupB] ?? GROUP_SORT_ORDER.length
    if (groupRankA !== groupRankB) return groupRankA - groupRankB
    const qtyA = Number(a?.quantity) || 0
    const qtyB = Number(b?.quantity) || 0
    if (qtyA !== qtyB) return qtyB - qtyA
    return String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
  })
}

/**
 * Build the full CSV string from current cards, archetypes, matchup values, and optional card types.
 */
export function buildMatchupCsv(cards, archetypes, matchupValues, cardTypes = {}) {
  const header = ['Card', 'Qty', 'Type', 'Group', ...(archetypes || []).map((a) => a.name)]
  const rows = [header.map(escapeCsvField).join(',')]
  const sorted = sortCardsForExport(cards || [], cardTypes)

  for (const card of sorted) {
    const typeStr = cardTypes[card.name] ?? ''
    const groupStr = getCardGroup(typeStr)
    const archetypeValues = (archetypes || []).map((arch) => {
      const key = `${card.name}::${arch.name}`
      return matchupValues[key] ?? ''
    })
    const row = [card.name, card.quantity, typeStr, groupStr, ...archetypeValues]
    rows.push(row.map(escapeCsvField).join(','))
  }

  return rows.join('\r\n')
}

/**
 * Trigger a file download of the matchup table as CSV.
 * Uses a temporary blob URL and a programmatic link click.
 */
export function downloadMatchupCsv(cards, archetypes, matchupValues, cardTypes = {}, filename = 'matchup-table.csv') {
  const csv = buildMatchupCsv(cards, archetypes, matchupValues, cardTypes)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
