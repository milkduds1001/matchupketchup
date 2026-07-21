/**
 * Matchup-matrix key format: encodes (card, archetype, main/sideboard zone, play/draw role)
 * into the flat string keys used to index a deck's matchup value map (App.jsx's
 * `matchupValues`, one flat object per deck). This is the shared key format other modules
 * read/write cells against — matchupCardAdjust.js and csv.js build/consume individual cell
 * keys, MatchupTable.jsx and SideboardGuide.jsx render off of them, and App.jsx runs the
 * legacy migration below once per deck load.
 *
 * Current format — separate values for "on the play" vs "on the draw":
 *   Main:      cardName::play|draw::archetypeName
 *   Sideboard: cardName::sideboard::play|draw::archetypeName
 *
 * Legacy format (pre play/draw split), one "unified" value per card/archetype:
 *   Main:      cardName::archetypeName
 *   Sideboard: cardName::sideboard::archetypeName
 * Legacy keys are migrated to the play/draw format the first time a deck loads — see
 * migrateLegacyUnifiedToPlayDraw. The `role: 'unified'` option below exists only to
 * build/read that legacy shape during migration; it is not written for new cells.
 */

// ---------------------------------------------------------------------------
// Key building
// ---------------------------------------------------------------------------

/**
 * @param {string} cardName
 * @param {string} archName
 * @param {{ zone?: 'main'|'sideboard', role?: 'unified'|'play'|'draw' }} [opts]
 */
export function matchupCellKey(cardName, archName, opts = {}) {
  const zone = opts.zone === 'sideboard' ? 'sideboard' : 'main'
  const role = opts.role === 'play' || opts.role === 'draw' ? opts.role : 'unified'
  if (role === 'play' || role === 'draw') {
    if (zone === 'sideboard') return `${cardName}::sideboard::${role}::${archName}`
    return `${cardName}::${role}::${archName}`
  }
  if (zone === 'sideboard') return `${cardName}::sideboard::${archName}`
  return `${cardName}::${archName}`
}

/**
 * @param {{ name: string, zone?: string }} card
 * @param {string} archName
 * @param {'play'|'draw'} role
 */
export function cellKeyForCard(card, archName, role) {
  const zone = card.zone === 'sideboard' ? 'sideboard' : 'main'
  return matchupCellKey(card.name, archName, { zone, role })
}

// ---------------------------------------------------------------------------
// Key parsing
// ---------------------------------------------------------------------------

/**
 * Inverse of matchupCellKey. Disambiguates the four key shapes (legacy main, legacy
 * sideboard, play/draw main, play/draw sideboard) purely from the number of `::`-delimited
 * segments and the fixed marker tokens (`sideboard`, `play`, `draw`) that appear right before
 * the trailing archetype name.
 * @returns {{ cardName: string, zone: 'main'|'sideboard', role: 'unified'|'play'|'draw', archName: string } | null}
 */
export function parseMatchupKey(key) {
  const parts = String(key).split('::')
  const n = parts.length
  if (n < 2) return null
  const archName = parts[n - 1]
  if (n === 2) {
    return { cardName: parts[0], zone: 'main', role: 'unified', archName }
  }
  if (n === 3) {
    const mid = parts[1]
    if (mid === 'sideboard') {
      return { cardName: parts[0], zone: 'sideboard', role: 'unified', archName }
    }
    if (mid === 'play' || mid === 'draw') {
      return { cardName: parts[0], zone: 'main', role: mid, archName }
    }
    return null
  }
  // n >= 4: card names normally don't contain '::', but if one did, re-join every segment
  // before the role/zone markers so the card name still round-trips correctly.
  const mid2 = parts[n - 2]
  const mid1 = parts[n - 3]
  if (mid1 === 'sideboard' && (mid2 === 'play' || mid2 === 'draw')) {
    return {
      cardName: parts.slice(0, n - 3).join('::'),
      zone: 'sideboard',
      role: mid2,
      archName,
    }
  }
  if (mid2 === 'play' || mid2 === 'draw') {
    return {
      cardName: parts.slice(0, n - 2).join('::'),
      zone: 'main',
      role: mid2,
      archName,
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Legacy (pre play/draw) key helpers + migration
// ---------------------------------------------------------------------------

/** Legacy (pre play/draw) sideboard key shape: `cardName::sideboard::archName`. */
export function legacySideboardUnifiedKey(cardName, archName) {
  return `${cardName}::sideboard::${archName}`
}

/** Legacy (pre play/draw) main-deck key shape: `cardName::archName`. */
export function legacyMainKey(cardName, archName) {
  return `${cardName}::${archName}`
}

/**
 * One-time migration run per deck load (see App.jsx): for every card/archetype pair that has
 * no play or draw value yet, copy its legacy unified value (if any) into both the `play` and
 * `draw` keys, then delete the unified/legacy key. Pairs that already have a play or draw
 * value are left untouched, so this only ever backfills — it's safe to call on every load and
 * a no-op once a deck has been migrated.
 * @returns {{ next: Record<string, string>, changed: boolean }}
 */
export function migrateLegacyUnifiedToPlayDraw(matchupValues, archetypes, cards) {
  if (!matchupValues || typeof matchupValues !== 'object' || Array.isArray(matchupValues)) {
    return { next: {}, changed: false }
  }
  const next = { ...matchupValues }
  let changed = false
  const arches = (archetypes || []).filter((a) => a && typeof a.name === 'string' && a.name.trim())
  for (const arch of arches) {
    for (const card of cards || []) {
      if (!card?.name) continue
      const zone = card.zone === 'sideboard' ? 'sideboard' : 'main'
      const playK = matchupCellKey(card.name, arch.name, { zone, role: 'play' })
      const drawK = matchupCellKey(card.name, arch.name, { zone, role: 'draw' })
      const playStr = next[playK]
      const drawStr = next[drawK]
      const hasPlay = playStr !== undefined && playStr !== null && String(playStr).trim() !== ''
      const hasDraw = drawStr !== undefined && drawStr !== null && String(drawStr).trim() !== ''
      if (hasPlay || hasDraw) continue
      // legacySideboardUnifiedKey/legacyMainKey produce the same string as
      // matchupCellKey(..., { role: 'unified' }) — using the explicit legacy helper here
      // for clarity about which shape is being read.
      const legacyKey =
        zone === 'sideboard'
          ? legacySideboardUnifiedKey(card.name, arch.name)
          : legacyMainKey(card.name, arch.name)
      const base = next[legacyKey]
      if (base === undefined || base === null || String(base).trim() === '') continue
      const s = String(base)
      next[playK] = s
      next[drawK] = s
      delete next[legacyKey]
      changed = true
    }
  }
  return changed ? { next, changed: true } : { next: matchupValues, changed: false }
}

// ---------------------------------------------------------------------------
// Derived views (used by the printed sideboard guide)
// ---------------------------------------------------------------------------

/**
 * Scans every key in matchupValues for the given archetype + role and splits the raw
 * per-cell counts into OUT (negative) and IN (positive) card lists, sorted alphabetically.
 * `role` is normally 'play' or 'draw'; pass 'unified' to pick up any legacy keys that
 * haven't been migrated yet.
 */
export function buildOutsAndInsForArchetypeRole(matchupValues, archName, role) {
  const outs = []
  const ins = []
  if (!matchupValues || typeof matchupValues !== 'object' || Array.isArray(matchupValues)) {
    return { outs, ins }
  }
  for (const key of Object.keys(matchupValues)) {
    const p = parseMatchupKey(key)
    if (!p || p.archName !== archName || p.role !== role) continue
    const raw = matchupValues[key]
    if (raw === undefined || raw === null || raw === '') continue
    const n = Number.parseInt(String(raw).trim(), 10)
    if (Number.isNaN(n)) continue
    const cardName = p.cardName
    if (n < 0) outs.push({ cardName, qty: Math.abs(n) })
    else if (n > 0) ins.push({ cardName, qty: n })
  }
  outs.sort((a, b) => a.cardName.localeCompare(b.cardName))
  ins.sort((a, b) => a.cardName.localeCompare(b.cardName))
  return { outs, ins }
}
