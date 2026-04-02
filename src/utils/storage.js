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

export const DEFAULT_FORMATS = ['Standard', 'Pioneer', 'Modern', 'Legacy']

function formatsListKey(userId) {
  return `mtg-formats-list-${userId}`
}

/**
 * User's format dropdown options: persisted list, or defaults when missing/invalid.
 */
export function getFormats(userId) {
  if (!userId) return [...DEFAULT_FORMATS]
  const raw = getStored(formatsListKey(userId), null)
  if (!Array.isArray(raw)) return [...DEFAULT_FORMATS]
  const valid = raw
    .filter((f) => typeof f === 'string' && f.trim())
    .map((f) => f.trim())
    .filter((f) => f !== 'Other')
  return valid.length > 0 ? valid : [...DEFAULT_FORMATS]
}

export function saveFormats(userId, formats) {
  if (!userId || !Array.isArray(formats)) return
  const list = formats.map((f) => (typeof f === 'string' ? f.trim() : '')).filter(Boolean)
  setStored(formatsListKey(userId), list)
}

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
  const allowed = getFormats(userId)
  const next = { ...decklist, format: allowed.includes(decklist.format) ? decklist.format : allowed[0] }
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
  const allowed = getFormats(userId)
  const next = { ...metagame, format: allowed.includes(metagame.format) ? metagame.format : allowed[0] }
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
  if (!userId || !decklistId || !metagameId) {
    return { matchupValues: {}, keysToMatchup: {} }
  }
  const data = getStored(matchupDataKey(userId), null)
  if (!data || typeof data !== 'object') {
    return { matchupValues: {}, keysToMatchup: {} }
  }
  const pair = data[pairKey(decklistId, metagameId)]
  if (!pair || typeof pair !== 'object') {
    return { matchupValues: {}, keysToMatchup: {} }
  }
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

// --- Per-format metagame grid (rows = deck names, columns = metagame scenarios) ---

/** Fixed label for column 1 (synced metagame name); date shown only in the grid UI. */
export const GOLDFISH_COLUMN_LABEL = 'MTG Goldfish (Last 30 days)'

const METAGAME_GRID_MAX_COLUMNS = 5

function trimMetagameColumns(columns) {
  if (columns.length <= METAGAME_GRID_MAX_COLUMNS) return columns
  return columns.slice(0, METAGAME_GRID_MAX_COLUMNS)
}

function cellsForColumnSet(grid, columns, priorCells) {
  const cells = {}
  for (const row of grid.rows) {
    const prev = priorCells[row.id] || {}
    const next = {}
    for (const col of columns) {
      next[col.id] = prev[col.id] ?? ''
    }
    cells[row.id] = next
  }
  return cells
}

function metagameGridKey(userId) {
  return `mtg-metagame-grids-${userId}`
}

function mgUid() {
  return 'mg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

function stableRowIdFromName(name) {
  const s = String(name).trim()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return 'row-' + Math.abs(h).toString(36)
}

function isValidMetagameGrid(grid) {
  return (
    grid != null
    && typeof grid === 'object'
    && Array.isArray(grid.columns)
    && grid.columns.length > 0
    && grid.columns.every((c) => c && typeof c.id === 'string' && typeof c.label === 'string')
    && Array.isArray(grid.rows)
    && grid.rows.length > 0
    && grid.rows.every((r) => r && typeof r.id === 'string')
    && grid.cells != null
    && typeof grid.cells === 'object'
  )
}

/**
 * Default grid: Goldfish column + two custom metagame columns and empty rows.
 */
export function createDefaultMetagameGrid() {
  const mkCol = (label) => ({ id: mgUid(), label })
  const goldCol = { id: mgUid(), label: GOLDFISH_COLUMN_LABEL }
  return {
    columns: [goldCol, mkCol('Metagame 2'), mkCol('Metagame 3')],
    rows: Array.from({ length: 12 }, () => ({ id: mgUid(), name: '' })),
    cells: {},
    defaults: {
      source: 'MTG Goldfish',
      snapshotLabel: 'Last 30 Days',
      fetchedAt: '',
      lockedColumnId: goldCol.id,
      lockedRowIds: [],
    },
  }
}

function ensureGoldfishMetadata(grid) {
  if (!isValidMetagameGrid(grid)) return grid
  const d = grid.defaults && typeof grid.defaults === 'object' ? grid.defaults : {}
  const lockedId = typeof d.lockedColumnId === 'string' && d.lockedColumnId ? d.lockedColumnId : ''

  const buildDefaults = (firstColId, lockedRowIds) => ({
    source: typeof d.source === 'string' ? d.source : 'MTG Goldfish',
    snapshotLabel: typeof d.snapshotLabel === 'string' ? d.snapshotLabel : 'Last 30 Days',
    fetchedAt: typeof d.fetchedAt === 'string' ? d.fetchedAt : '',
    lockedColumnId: firstColId,
    lockedRowIds: Array.isArray(lockedRowIds) ? [...lockedRowIds] : [],
  })

  let columns = [...grid.columns]
  let cells = grid.cells
  let lockedRowIds = Array.isArray(d.lockedRowIds) ? [...d.lockedRowIds] : []
  let changed = false

  const prependGoldfish = () => {
    const goldCol = { id: mgUid(), label: GOLDFISH_COLUMN_LABEL }
    columns = trimMetagameColumns([goldCol, ...columns])
    lockedRowIds = []
    cells = cellsForColumnSet(grid, columns, grid.cells)
    changed = true
  }

  if (!lockedId) {
    prependGoldfish()
    const defaults = buildDefaults(columns[0].id, lockedRowIds)
    return changed ? { ...grid, columns, cells, defaults } : grid
  }

  const lockedIdx = columns.findIndex((c) => c.id === lockedId)
  if (lockedIdx < 0) {
    prependGoldfish()
    const defaults = buildDefaults(columns[0].id, lockedRowIds)
    return { ...grid, columns, cells, defaults }
  }

  if (lockedIdx !== 0) {
    const lockedCol = columns[lockedIdx]
    columns = trimMetagameColumns([lockedCol, ...columns.filter((_, i) => i !== lockedIdx)])
    cells = cellsForColumnSet(grid, columns, grid.cells)
    changed = true
  } else {
    const trimmed = trimMetagameColumns(columns)
    if (trimmed.length !== columns.length || trimmed.some((c, i) => c.id !== columns[i].id)) {
      columns = trimmed
      cells = cellsForColumnSet(grid, columns, grid.cells)
      changed = true
    } else {
      columns = trimmed
    }
  }

  if (columns[0].label !== GOLDFISH_COLUMN_LABEL) {
    columns = columns.map((c, i) => (i === 0 ? { ...c, label: GOLDFISH_COLUMN_LABEL } : c))
    changed = true
  }

  const defaults = buildDefaults(columns[0].id, lockedRowIds)
  const defaultsChanged = JSON.stringify(defaults) !== JSON.stringify(grid.defaults || {})
  if (defaultsChanged) changed = true

  if (!changed) return grid
  return { ...grid, columns, cells, defaults }
}

function migrateLegacyMetagamesToGrid(userId, format) {
  const metas = getMetagames(userId).filter((m) => (m.format || '') === format)
  if (metas.length === 0) {
    return createDefaultMetagameGrid()
  }

  const maxUserCols = METAGAME_GRID_MAX_COLUMNS - 1
  const metasOrdered = metas.slice(0, maxUserCols)
  const goldCol = { id: mgUid(), label: GOLDFISH_COLUMN_LABEL }
  const columns = [goldCol, ...metasOrdered.map((m) => ({ id: m.id, label: m.name }))]

  const nameSet = new Set()
  metasOrdered.forEach((m) => {
    ;(m.archetypes || []).forEach((a) => {
      if (a && typeof a.name === 'string' && a.name.trim()) nameSet.add(a.name.trim())
    })
  })
  const sortedNames = [...nameSet].sort((a, b) => a.localeCompare(b))
  let rows = sortedNames.map((name) => ({
    id: stableRowIdFromName(name),
    name,
  }))
  if (rows.length === 0) {
    rows = Array.from({ length: 12 }, () => ({ id: mgUid(), name: '' }))
  }
  const cells = {}
  rows.forEach((r) => {
    cells[r.id] = { [goldCol.id]: '' }
  })
  metasOrdered.forEach((m) => {
    const archByName = Object.fromEntries(
      (m.archetypes || [])
        .filter((a) => a && typeof a.name === 'string')
        .map((a) => [a.name.trim(), typeof a.metagamePercent === 'number' ? a.metagamePercent : 0])
    )
    rows.forEach((row) => {
      cells[row.id][m.id] = archByName[row.name] ?? 0
    })
  })
  return {
    columns,
    rows,
    cells,
    defaults: {
      source: 'MTG Goldfish',
      snapshotLabel: 'Last 30 Days',
      fetchedAt: '',
      lockedColumnId: goldCol.id,
      lockedRowIds: [],
    },
  }
}

function clampMetagamePercent(value) {
  const n = Number.parseFloat(String(value ?? '').replace(/%/g, '').trim())
  if (Number.isNaN(n) || n < 0) return 0
  return Math.min(100, Math.round(n))
}

/** Parse stored cell text for sorting (supports decimals from snapshots). */
function parsePctCell(raw) {
  const n = Number.parseFloat(String(raw ?? '').trim())
  if (Number.isNaN(n)) return 0
  return Math.min(100, Math.max(0, n))
}

/**
 * Reorders locked Goldfish rows by first-column % descending (fixes stale alphabetical order).
 */
function reorderLockedRowsByFirstColumnDesc(grid) {
  if (!isValidMetagameGrid(grid)) return grid
  const firstColId = grid.columns?.[0]?.id
  const lockedIds = grid?.defaults?.lockedRowIds
  if (!firstColId || !Array.isArray(lockedIds) || lockedIds.length === 0) return grid

  const lockedUnique = [...new Set(lockedIds)]
  const lockedSet = new Set(lockedUnique)
  const nameById = (id) => String(grid.rows.find((r) => r.id === id)?.name ?? '')

  const sortedLockedIds = lockedUnique.sort((a, b) => {
    const va = parsePctCell(grid.cells?.[a]?.[firstColId])
    const vb = parsePctCell(grid.cells?.[b]?.[firstColId])
    if (vb !== va) return vb - va
    return nameById(a).localeCompare(nameById(b))
  })

  const orderedPrefix = sortedLockedIds
    .map((id) => grid.rows.find((r) => r.id === id))
    .filter(Boolean)
  const unlockedRows = grid.rows.filter((r) => !lockedSet.has(r.id))
  const nextRows = [...orderedPrefix, ...unlockedRows]

  if (nextRows.length !== grid.rows.length) return grid

  const sameOrder = nextRows.every((row, i) => row.id === grid.rows[i].id)
  if (sameOrder) return grid

  return {
    ...grid,
    rows: nextRows,
    defaults: { ...grid.defaults, lockedRowIds: sortedLockedIds },
  }
}

function normalizeRowKey(name) {
  return String(name ?? '').trim().toLowerCase()
}

/**
 * Read the raw grid object for a format (may be missing or invalid).
 */
export function getMetagameGridRaw(userId, format) {
  if (!userId || !format) return null
  const all = getStored(metagameGridKey(userId), null)
  if (!all || typeof all !== 'object') return null
  return all[format] ?? null
}

/**
 * Persist the grid for a format (does not sync column metagames).
 */
export function saveMetagameGridOnly(userId, format, grid) {
  if (!userId || !format || !isValidMetagameGrid(grid)) return
  const all = getStored(metagameGridKey(userId), null) || {}
  const obj = typeof all === 'object' ? all : {}
  obj[format] = grid
  setStored(metagameGridKey(userId), obj)
}

/**
 * For each column, upsert a metagame with that id and label; remove metagames for this format
 * whose ids are no longer columns.
 */
export function syncMetagamesFromGrid(userId, format, grid) {
  if (!userId || !format || !isValidMetagameGrid(grid)) return

  const colIds = new Set(grid.columns.map((c) => c.id))
  const existing = getMetagames(userId).filter((m) => (m.format || '') === format)
  for (const m of existing) {
    if (!colIds.has(m.id)) {
      deleteMetagame(userId, m.id)
    }
  }

  for (const col of grid.columns) {
    const archetypes = grid.rows
      .filter((r) => String(r.name ?? '').trim())
      .map((r) => {
        const raw = grid.cells?.[r.id]?.[col.id]
        return {
          id: r.id,
          name: String(r.name).trim(),
          metagamePercent: clampMetagamePercent(raw),
        }
      })
    saveMetagame(userId, {
      id: col.id,
      name: col.label.trim() || 'Metagame',
      format,
      archetypes,
    })
  }
}

/**
 * Ensure a valid grid exists for the format (migrate from legacy metagames or create default),
 * save it, and sync metagame records. Returns the grid.
 */
export function ensureMetagameGrid(userId, format) {
  if (!userId || !format) return null
  const all = getStored(metagameGridKey(userId), null) || {}
  const obj = typeof all === 'object' ? all : {}
  let grid = obj[format]
  if (!isValidMetagameGrid(grid)) {
    grid = migrateLegacyMetagamesToGrid(userId, format)
    obj[format] = grid
    setStored(metagameGridKey(userId), obj)
  }
  const normalized = ensureGoldfishMetadata(grid)
  if (normalized !== grid) {
    obj[format] = normalized
    setStored(metagameGridKey(userId), obj)
    grid = normalized
  }
  const reordered = reorderLockedRowsByFirstColumnDesc(grid)
  if (reordered !== grid) {
    obj[format] = reordered
    setStored(metagameGridKey(userId), obj)
    grid = reordered
  }
  syncMetagamesFromGrid(userId, format, grid)
  return grid
}

/**
 * Save grid to storage and sync column metagames (use after user edits).
 */
export function saveMetagameGrid(userId, format, grid) {
  if (!userId || !format || !isValidMetagameGrid(grid)) return
  saveMetagameGridOnly(userId, format, grid)
  syncMetagamesFromGrid(userId, format, grid)
}

/**
 * Returns a new grid with defaults written into the first column.
 * - Keeps existing rows where names match.
 * - Adds rows for missing archetypes.
 * - Optionally updates first-column label.
 */
export function applyDefaultsToFirstMetagameColumn(grid, archetypes, firstColumnLabel = '') {
  if (!isValidMetagameGrid(grid)) return grid
  if (!Array.isArray(archetypes) || archetypes.length === 0) return grid

  const firstCol = grid.columns[0]
  if (!firstCol?.id) return grid

  const normalized = archetypes
    .map((item) => ({
      name: String(item?.name ?? '').trim(),
      metagamePercent: clampMetagamePercent(item?.metagamePercent),
    }))
    .filter((item) => item.name)

  if (normalized.length === 0) return grid

  const rows = [...grid.rows]
  const cells = { ...grid.cells }
  rows.forEach((row) => {
    cells[row.id] = { ...(cells[row.id] || {}) }
  })

  const rowByName = new Map(rows.map((row) => [normalizeRowKey(row.name), row]))
  for (const arch of normalized) {
    const key = normalizeRowKey(arch.name)
    let row = rowByName.get(key)
    if (!row) {
      row = { id: mgUid(), name: arch.name }
      rows.push(row)
      rowByName.set(key, row)
      cells[row.id] = {}
      for (const col of grid.columns) cells[row.id][col.id] = ''
    }
    cells[row.id][firstCol.id] = String(arch.metagamePercent)
  }

  const columns = grid.columns.map((col, idx) => {
    if (idx !== 0 || !firstColumnLabel.trim()) return col
    return { ...col, label: firstColumnLabel.trim() }
  })

  return { ...grid, columns, rows, cells }
}

export function getLockedMetagameColumnId(grid) {
  return String(grid?.defaults?.lockedColumnId || '')
}

export function isLockedMetagameRow(grid, rowId) {
  if (!rowId) return false
  const locked = Array.isArray(grid?.defaults?.lockedRowIds) ? grid.defaults.lockedRowIds : []
  return locked.includes(rowId)
}

/**
 * Applies MTG Goldfish defaults as a locked first-column baseline.
 * - First column label and values are managed by feed data.
 * - Rows sourced from feed are locked and sorted by descending baseline percentage.
 */
export function applyLockedGoldfishDefaults(grid, payload) {
  if (!isValidMetagameGrid(grid)) return grid
  const firstCol = grid.columns?.[0]
  if (!firstCol?.id) return grid

  const source = String(payload?.source || 'MTG Goldfish')
  const snapshotLabel = String(payload?.snapshotLabel || 'Last 30 Days')
  const fetchedAt = String(payload?.fetchedAt || '')

  const normalized = Array.isArray(payload?.archetypes)
    ? payload.archetypes
      .map((item) => ({
        name: String(item?.name ?? '').trim(),
        metagamePercent: clampMetagamePercent(item?.metagamePercent),
      }))
      .filter((item) => item.name)
      .sort((a, b) => b.metagamePercent - a.metagamePercent)
    : []

  if (normalized.length === 0) return grid

  const rowsById = new Map(grid.rows.map((row) => [row.id, { ...row }]))
  const rowByName = new Map(grid.rows.map((row) => [normalizeRowKey(row.name), row.id]))
  const cells = { ...grid.cells }
  grid.rows.forEach((row) => {
    cells[row.id] = { ...(cells[row.id] || {}) }
  })

  const lockedRowIds = []
  for (const arch of normalized) {
    const key = normalizeRowKey(arch.name)
    let rowId = rowByName.get(key)
    if (!rowId) {
      rowId = mgUid()
      rowsById.set(rowId, { id: rowId, name: arch.name })
      rowByName.set(key, rowId)
      cells[rowId] = {}
      for (const col of grid.columns) cells[rowId][col.id] = ''
    } else {
      rowsById.set(rowId, { ...rowsById.get(rowId), name: arch.name })
    }
    cells[rowId][firstCol.id] = String(arch.metagamePercent)
    lockedRowIds.push(rowId)
  }

  const lockedUnique = [...new Set(lockedRowIds)]
  lockedUnique.sort((a, b) => {
    const va = parsePctCell(cells[a]?.[firstCol.id])
    const vb = parsePctCell(cells[b]?.[firstCol.id])
    if (vb !== va) return vb - va
    const na = String(rowsById.get(a)?.name ?? '')
    const nb = String(rowsById.get(b)?.name ?? '')
    return na.localeCompare(nb)
  })

  const lockedSet = new Set(lockedUnique)
  const orderedRows = [
    ...lockedUnique.map((id) => rowsById.get(id)).filter(Boolean),
    ...grid.rows.filter((row) => !lockedSet.has(row.id)).map((row) => rowsById.get(row.id)),
  ].filter(Boolean)

  const columns = grid.columns.map((col, idx) => (idx === 0 ? { ...col, label: GOLDFISH_COLUMN_LABEL } : col))

  return {
    ...grid,
    columns,
    rows: orderedRows,
    cells,
    defaults: {
      source,
      snapshotLabel,
      fetchedAt,
      lockedColumnId: firstCol.id,
      lockedRowIds: lockedUnique,
    },
  }
}
