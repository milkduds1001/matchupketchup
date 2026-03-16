/**
 * localStorage helpers for the MTG Matchup Tool.
 * All functions handle missing or invalid data safely by returning fallbacks.
 */

const STORAGE_KEYS = {
  CARDS: 'mtg-sideboard-guide-cards',
  ARCHETYPES: 'mtg-sideboard-guide-archetypes',
  MATCHUP_VALUES: 'mtg-sideboard-guide-matchup-values',
  CARD_TYPES: 'mtg-sideboard-guide-card-types',
  KEYS_TO_MATCHUP: 'mtg-sideboard-guide-keys-to-matchup',
}

/**
 * Read a key from localStorage and parse as JSON.
 * Returns fallback if the key is missing, parse fails, or value is null/undefined.
 */
function getStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const value = JSON.parse(raw)
    return value ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Write a value to localStorage as JSON.
 * Ignores errors (e.g. quota exceeded or private mode).
 */
function setStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage errors
  }
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0
}

function isCard(item) {
  return (
    item != null &&
    typeof item === 'object' &&
    typeof item.name === 'string' &&
    typeof item.quantity === 'number'
  )
}

function isArchetype(item) {
  return (
    item != null &&
    typeof item === 'object' &&
    typeof item.name === 'string' &&
    typeof item.metagamePercent === 'number'
  )
}

function isMatchupValues(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Load cards from localStorage. Returns fallback if data is missing or invalid.
 * Valid cards have at least name (string) and quantity (number); id is optional.
 */
export function loadCards(fallback) {
  const stored = getStored(STORAGE_KEYS.CARDS, null)
  if (!isNonEmptyArray(stored)) return fallback
  const valid = stored.filter(isCard)
  return valid.length > 0 ? valid : fallback
}

/**
 * Save cards to localStorage. Called when the user changes deck/upload.
 */
export function saveCards(cards) {
  if (!Array.isArray(cards)) return
  setStored(STORAGE_KEYS.CARDS, cards)
}

/**
 * Load archetypes from localStorage. Returns fallback if data is missing or invalid.
 * Valid archetypes have name (string) and metagamePercent (number); id is optional.
 */
export function loadArchetypes(fallback) {
  const stored = getStored(STORAGE_KEYS.ARCHETYPES, null)
  if (!isNonEmptyArray(stored)) return fallback
  const valid = stored.filter(isArchetype)
  return valid.length > 0 ? valid : fallback
}

/**
 * Save archetypes to localStorage. Called when the user changes metagame input.
 */
export function saveArchetypes(archetypes) {
  if (!Array.isArray(archetypes)) return
  setStored(STORAGE_KEYS.ARCHETYPES, archetypes)
}

/**
 * Load matchup cell values (flat object keyed by "cardId::archetypeId") from localStorage.
 * Returns fallback if data is missing or invalid.
 */
export function loadMatchupValues(fallback) {
  const stored = getStored(STORAGE_KEYS.MATCHUP_VALUES, null)
  if (!isMatchupValues(stored)) return fallback
  return stored
}

/**
 * Save matchup cell values to localStorage. Called when the user edits a matchup cell.
 */
export function saveMatchupValues(matchupValues) {
  if (!isMatchupValues(matchupValues)) return
  setStored(STORAGE_KEYS.MATCHUP_VALUES, matchupValues)
}

/**
 * Card types cache: object mapping card name (string) -> type_line (string).
 */
function isCardTypes(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function loadCardTypes(fallback = {}) {
  const stored = getStored(STORAGE_KEYS.CARD_TYPES, null)
  if (!isCardTypes(stored)) return fallback
  return stored
}

export function saveCardTypes(cardTypes) {
  if (!isCardTypes(cardTypes)) return
  setStored(STORAGE_KEYS.CARD_TYPES, cardTypes)
}

/**
 * Keys to the matchup: object mapping archetype name (string) -> free text (string).
 */
function isKeysToMatchup(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function loadKeysToMatchup(fallback = {}) {
  const stored = getStored(STORAGE_KEYS.KEYS_TO_MATCHUP, null)
  if (!isKeysToMatchup(stored)) return fallback
  return stored
}

export function saveKeysToMatchup(keysToMatchup) {
  if (!isKeysToMatchup(keysToMatchup)) return
  setStored(STORAGE_KEYS.KEYS_TO_MATCHUP, keysToMatchup)
}

/**
 * Build a default flat matchup object from cards and archetypes (for first load when nothing is saved).
 * Card objects may have archetype names as keys with numeric values.
 */
export function buildDefaultMatchupValues(cards, archetypes) {
  const result = {}
  if (!Array.isArray(cards) || !Array.isArray(archetypes)) return result
  cards.forEach((card) => {
    archetypes.forEach((arch) => {
      const val = card[arch.name]
      if (typeof val === 'number') result[`${card.name}::${arch.name}`] = String(val)
    })
  })
  return result
}

// --- User-scoped storage (decklists, metagames, matchup data per deck+metagame) ---

const FORMATS = ['Standard', 'Pioneer', 'Modern', 'Legacy', 'Other']

export { FORMATS }

function decklistsKey(userId) {
  return `mtg-decklists-${userId}`
}

function metagamesKey(userId) {
  return `mtg-metagames-${userId}`
}

function matchupDataKey(userId) {
  return `mtg-matchup-data-${userId}`
}

function pairKey(decklistId, metagameId) {
  return `${decklistId}_${metagameId}`
}

export function getDecklists(userId) {
  if (!userId) return []
  const raw = getStored(decklistsKey(userId), null)
  if (!Array.isArray(raw)) return []
  return raw.filter((d) => d && d.id && d.name && Array.isArray(d.cards))
}

export function saveDecklist(userId, decklist) {
  if (!userId || !decklist?.id || !decklist?.name || !Array.isArray(decklist.cards)) return
  const list = getDecklists(userId)
  const idx = list.findIndex((d) => d.id === decklist.id)
  const next = { ...decklist, format: FORMATS.includes(decklist.format) ? decklist.format : FORMATS[0] }
  if (idx >= 0) list[idx] = next
  else list.push(next)
  setStored(decklistsKey(userId), list)
}

export function deleteDecklist(userId, id) {
  if (!userId || !id) return
  const list = getDecklists(userId).filter((d) => d.id !== id)
  setStored(decklistsKey(userId), list)
}

export function getMetagames(userId) {
  if (!userId) return []
  const raw = getStored(metagamesKey(userId), null)
  if (!Array.isArray(raw)) return []
  return raw.filter((m) => m && m.id && m.name && Array.isArray(m.archetypes))
}

export function saveMetagame(userId, metagame) {
  if (!userId || !metagame?.id || !metagame?.name || !Array.isArray(metagame.archetypes)) return
  const list = getMetagames(userId)
  const idx = list.findIndex((m) => m.id === metagame.id)
  const next = { ...metagame, format: FORMATS.includes(metagame.format) ? metagame.format : FORMATS[0] }
  if (idx >= 0) list[idx] = next
  else list.push(next)
  setStored(metagamesKey(userId), list)
}

export function deleteMetagame(userId, id) {
  if (!userId || !id) return
  const list = getMetagames(userId).filter((m) => m.id !== id)
  setStored(metagamesKey(userId), list)
}

export function getMatchupData(userId, decklistId, metagameId) {
  if (!userId || !decklistId || !metagameId) return { matchupValues: {}, keysToMatchup: {} }
  const data = getStored(matchupDataKey(userId), null)
  if (!data || typeof data !== 'object') return { matchupValues: {}, keysToMatchup: {} }
  const pair = data[pairKey(decklistId, metagameId)]
  if (!pair || typeof pair !== 'object') return { matchupValues: {}, keysToMatchup: {} }
  return {
    matchupValues: isMatchupValues(pair.matchupValues) ? pair.matchupValues : {},
    keysToMatchup: isKeysToMatchup(pair.keysToMatchup) ? pair.keysToMatchup : {},
  }
}

export function saveMatchupData(userId, decklistId, metagameId, payload) {
  if (!userId || !decklistId || !metagameId) return
  const key = matchupDataKey(userId)
  const data = getStored(key, null) || {}
  const obj = typeof data === 'object' && !Array.isArray(data) ? data : {}
  obj[pairKey(decklistId, metagameId)] = {
    matchupValues: isMatchupValues(payload?.matchupValues) ? payload.matchupValues : {},
    keysToMatchup: isKeysToMatchup(payload?.keysToMatchup) ? payload.keysToMatchup : {},
  }
  setStored(key, obj)
}
