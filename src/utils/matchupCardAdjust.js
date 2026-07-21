/**
 * matchupCardAdjust.js — reads and writes the in/out copy counts for a single card within one
 * matchup cell (archetype + on-the-play/on-the-draw role), on behalf of MatchupCardBoard.jsx.
 * Counts are stored as signed strings in the shared `values` map (negative = copies moved OUT
 * of the main deck, positive = copies moved IN from the sideboard) — see matchupKeys.js for the
 * cell-key format that ties a card/archetype/role together.
 */
import { cellKeyForCard } from './matchupKeys.js'

/** Parse a stored cell value ('', undefined, or a numeric string) into a safe integer, defaulting to 0. */
function parseStoredValue(raw) {
  if (raw === undefined || raw === null || raw === '') return 0
  const n = Number.parseInt(String(raw).trim(), 10)
  return Number.isNaN(n) ? 0 : n
}

/** Assigned out copies for a main-deck card (always non-negative). */
export function getAssignedOutCount(card, archName, role, values = {}) {
  if (card?.zone === 'sideboard') return 0
  const key = cellKeyForCard(card, archName, role)
  const n = parseStoredValue(values[key])
  return n < 0 ? Math.abs(n) : 0
}

/** Assigned in copies for a sideboard card (always non-negative). */
export function getAssignedInCount(card, archName, role, values = {}) {
  if (card?.zone !== 'sideboard') return 0
  const key = cellKeyForCard(card, archName, role)
  const n = parseStoredValue(values[key])
  return n > 0 ? n : 0
}

/** Main-deck copies still available to drag/click OUT (total copies minus already-assigned outs). */
export function getAvailableDeckCopies(card, archName, role, values = {}) {
  const total = Number(card?.quantity) || 0
  return Math.max(0, total - getAssignedOutCount(card, archName, role, values))
}

/** Sideboard copies still available to drag/click IN (total copies minus already-assigned ins). */
export function getAvailableSideboardCopies(card, archName, role, values = {}) {
  const total = Number(card?.quantity) || 0
  return Math.max(0, total - getAssignedInCount(card, archName, role, values))
}

/**
 * Adjust sideboard in / main out counts for one card in the current plan.
 * @param {object} card
 * @param {string} archName
 * @param {'play'|'draw'} role
 * @param {number} delta - positive adds out/in, negative returns copies to deck
 * @param {Record<string, string>} values
 * @param {(key: string, archName: string, next: string) => void} onChangeCell
 */
export function adjustMatchupAssignment(card, archName, role, delta, values, onChangeCell) {
  if (!card?.name || !archName || !role || !delta) return
  const key = cellKeyForCard(card, archName, role)
  const max = Number(card.quantity) || 0
  if (max <= 0) return

  if (card.zone === 'sideboard') {
    const current = getAssignedInCount(card, archName, role, values)
    const next = Math.max(0, Math.min(max, current + delta))
    onChangeCell?.(key, archName, next === 0 ? '' : String(next))
    return
  }

  const current = getAssignedOutCount(card, archName, role, values)
  const next = Math.max(0, Math.min(max, current + delta))
  onChangeCell?.(key, archName, next === 0 ? '' : String(-next))
}
