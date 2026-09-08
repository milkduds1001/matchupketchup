/**
 * manaColumns.js — groups a list of deck/sideboard cards into mana-value columns
 * (0, 1, 2, ... 7+, then lands) for MatchupCardBoard.jsx's card-pile layout. Lands are always
 * bucketed by type line rather than CMC, and always sort last (see MANA_COLUMN_ORDER).
 */
import { CARD_GROUP_LANDS, getCardGroup } from './cardGrouping.js'

export const MANA_COLUMN_LANDS = 'lands'
/** Bucket for cards whose Scryfall lookup never resolved a mana value — kept apart from '0' so an
 * unresolved card (e.g. one whose printed name Scryfall doesn't recognize) isn't silently shown
 * as a confirmed 0-cost card. */
export const MANA_COLUMN_UNKNOWN = 'unknown'

/** Display order for mana columns (lands, then unresolved cards, always last). */
export const MANA_COLUMN_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7+', MANA_COLUMN_LANDS, MANA_COLUMN_UNKNOWN]

/**
 * Resolve which mana column a card belongs in.
 * Lands are grouped separately regardless of CMC.
 */
export function getManaColumnForCard(card, cardTypes = {}, cardManaValues = {}) {
  const name = String(card?.name ?? '').trim()
  if (!name) return '0'
  const typeLine = cardTypes[name]
  if (getCardGroup(typeLine) === CARD_GROUP_LANDS) return MANA_COLUMN_LANDS
  const raw = cardManaValues[name]
  if (raw == null) return MANA_COLUMN_UNKNOWN
  const cmc = Number.isFinite(Number(raw)) ? Number(raw) : 0
  if (cmc >= 7) return '7+'
  return String(Math.max(0, Math.floor(cmc)))
}

/**
 * Array.sort comparator: orders cards by mana column (same order as MANA_COLUMN_ORDER), then
 * alphabetically within a column. Not currently called from MatchupCardBoard.jsx (which uses
 * buildManaColumnMap below to bucket + sort per-column instead), but exported for reuse by any
 * flat, single-list card sort that wants the same mana-value ordering.
 */
export function sortCardsByManaThenName(a, b, cardTypes = {}, cardManaValues = {}) {
  const colA = getManaColumnForCard(a, cardTypes, cardManaValues)
  const colB = getManaColumnForCard(b, cardTypes, cardManaValues)
  const rankA = MANA_COLUMN_ORDER.indexOf(colA)
  const rankB = MANA_COLUMN_ORDER.indexOf(colB)
  const safeA = rankA >= 0 ? rankA : MANA_COLUMN_ORDER.length
  const safeB = rankB >= 0 ? rankB : MANA_COLUMN_ORDER.length
  if (safeA !== safeB) return safeA - safeB
  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
}

/**
 * Group deck cards into mana columns for the pile board.
 * @returns {Map<string, Array<{ card: object, available: number }>>}
 */
export function buildManaColumnMap(cards, cardTypes, cardManaValues, hideLands, getAvailableQty) {
  const map = new Map(MANA_COLUMN_ORDER.map((key) => [key, []]))
  for (const card of cards || []) {
    if (!card?.name) continue
    if (hideLands && card.zone !== 'sideboard' && getCardGroup(cardTypes[card.name]) === CARD_GROUP_LANDS) {
      continue
    }
    const available = getAvailableQty(card)
    if (available <= 0) continue
    const column = getManaColumnForCard(card, cardTypes, cardManaValues)
    if (!map.has(column)) map.set(column, [])
    map.get(column).push({ card, available })
  }
  for (const [, list] of map) {
    list.sort((a, b) => String(a.card.name).localeCompare(String(b.card.name)))
  }
  return map
}

/** Human-readable header for a mana column key ('lands' -> 'Lands', numeric keys pass through). */
export function manaColumnLabel(columnKey) {
  if (columnKey === MANA_COLUMN_LANDS) return 'Lands'
  if (columnKey === MANA_COLUMN_UNKNOWN) return 'Unknown'
  if (columnKey === '7+') return '7+'
  return columnKey
}
