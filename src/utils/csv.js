/**
 * CSV export for the matchup table.
 *
 * How the CSV is generated:
 * 1. Header row: "Card", "Qty", "Type", "Group", then one column per archetype (archetype names).
 * 2. One data row per card: card name, quantity, type_line, group bucket, then archetype values.
 * 3. Fields that contain a comma, newline, or double-quote are wrapped in double quotes,
 *    and any double quotes inside are escaped as "" (RFC 4180-style).
 */

import { cellKeyForCard } from './matchupKeys.js'
import { GROUP_ORDER_MAP, GROUP_SORT_ORDER, getCardGroup } from './cardGrouping.js'

function escapeCsvField(value) {
  const str = String(value ?? '')
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
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
 * Each archetype exports two columns: "Name (play)" and "Name (draw)".
 */
export function buildMatchupCsv(cards, archetypes, matchupValues, cardTypes = {}) {
  const header = ['Card', 'Qty', 'Type', 'Group']
  for (const a of archetypes || []) {
    header.push(`${a.name} (play)`, `${a.name} (draw)`)
  }
  const rows = [header.map(escapeCsvField).join(',')]
  const sorted = sortCardsForExport(cards || [], cardTypes)

  for (const card of sorted) {
    const typeStr = cardTypes[card.name] ?? ''
    const groupStr = getCardGroup(typeStr)
    const archetypeValues = []
    for (const arch of archetypes || []) {
      archetypeValues.push(
        matchupValues[cellKeyForCard(card, arch.name, 'play')] ?? '',
        matchupValues[cellKeyForCard(card, arch.name, 'draw')] ?? ''
      )
    }
    const row = [card.name, card.quantity, typeStr, groupStr, ...archetypeValues]
    rows.push(row.map(escapeCsvField).join(','))
  }

  return rows.join('\r\n')
}

/**
 * Trigger a file download of the matchup table as CSV.
 * Uses a temporary blob URL and a programmatic link click.
 */
export function downloadMatchupCsv(
  cards,
  archetypes,
  matchupValues,
  cardTypes = {},
  filename = 'matchup-table.csv'
) {
  const csv = buildMatchupCsv(cards, archetypes, matchupValues, cardTypes)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
