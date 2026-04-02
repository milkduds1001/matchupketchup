/**
 * Matchup matrix cell keys and parsing.
 * Each archetype has two plan columns: on the play and on the draw.
 * Main: cardName::play|draw::archetypeName
 * Sideboard: cardName::sideboard::play|draw::archetypeName
 * Legacy unified (migrated on load): cardName::archetypeName, cardName::sideboard::archetypeName
 */

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

/**
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

export function legacySideboardUnifiedKey(cardName, archName) {
  return `${cardName}::sideboard::${archName}`
}

export function legacyMainKey(cardName, archName) {
  return `${cardName}::${archName}`
}

/**
 * One-time migration: if neither play nor draw is set, copy legacy unified into both and remove unified keys.
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
      const uni = matchupCellKey(card.name, arch.name, { zone, role: 'unified' })
      const leg = zone === 'sideboard' ? legacySideboardUnifiedKey(card.name, arch.name) : legacyMainKey(card.name, arch.name)
      const base = next[uni] ?? next[leg]
      if (base === undefined || base === null || String(base).trim() === '') continue
      const s = String(base)
      next[playK] = s
      next[drawK] = s
      delete next[uni]
      delete next[leg]
      changed = true
    }
  }
  return changed ? { next, changed: true } : { next: matchupValues, changed: false }
}

/**
 * OUTS / INS for one archetype and role (play | draw | unified for stray keys).
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
