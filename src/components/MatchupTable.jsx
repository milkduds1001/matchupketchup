import React from 'react'
import './MatchupTable.css'

const TYPE_SORT_ORDER = [
  'Land',
  'Creature',
  'Planeswalker',
  'Artifact',
  'Enchantment',
  'Instant',
  'Sorcery',
  'Tribal',
]
const TYPE_ORDER_MAP = Object.fromEntries(TYPE_SORT_ORDER.map((t, i) => [t, i]))

/** Bucket labels: many type_lines map to one of these three groups. */
export const CARD_GROUP_CREATURES_PLANESWALKERS = 'Creatures & Planeswalkers'
export const CARD_GROUP_OTHER_SPELLS = 'Other Spells'
export const CARD_GROUP_LANDS = 'Lands'

// Display order: Creatures & Planeswalkers, then Other Spells, then Lands
const GROUP_SORT_ORDER = [
  CARD_GROUP_CREATURES_PLANESWALKERS,
  CARD_GROUP_OTHER_SPELLS,
  CARD_GROUP_LANDS,
]
const GROUP_ORDER_MAP = Object.fromEntries(GROUP_SORT_ORDER.map((g, i) => [g, i]))

/**
 * Assign a card to exactly one display group from its type_line.
 * 1) If type includes "land" → Lands
 * 2) Else if type includes "creature" or "planeswalker" → Creatures & Planeswalkers
 * 3) Else → Other Spells
 */
export function getCardGroup(typeLine) {
  if (!typeLine || typeof typeLine !== 'string') return CARD_GROUP_OTHER_SPELLS
  const lower = typeLine.toLowerCase()
  if (lower.includes('land')) return CARD_GROUP_LANDS
  if (lower.includes('creature') || lower.includes('planeswalker')) return CARD_GROUP_CREATURES_PLANESWALKERS
  return CARD_GROUP_OTHER_SPELLS
}

function getTypeSortKey(typeLine) {
  if (!typeLine || typeof typeLine !== 'string') return [TYPE_SORT_ORDER.length, '']
  const mainPart = typeLine.split(/\s*[—\-]\s*/)[0].trim()
  const types = mainPart ? mainPart.split(/\s+/) : []
  const primary = types.find((t) => TYPE_ORDER_MAP[t] !== undefined) || types[0] || ''
  const rank = TYPE_ORDER_MAP[primary] ?? TYPE_SORT_ORDER.length
  return [rank, typeLine]
}

// Sort by group first (Creatures & Planeswalkers > Other Spells > Lands),
// then by descending quantity within the group, then alphabetically by name.
function sortCardsByGroupThenTypeThenQtyThenName(cardList, cardTypes = {}) {
  return [...cardList].sort((a, b) => {
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

const SHOW_TYPE_GROUP_COLUMNS = false

/**
 * MatchupTable - Renders a table of cards with quantities and editable per-archetype cells.
 *
 * Props:
 *   cards - Array of objects: { id?, name, quantity, zone? } (zone is "main" or "sideboard")
 *   archetypes - Array of objects: { name, metagamePercent }
 *   values - Flat object keyed "cardName::archetypeName" with string values for each cell
 *   cardTypes - Optional object mapping card name -> type_line (from Scryfall)
 *   hideLands - If true, hide cards in the Lands group from the main deck section
 *   onChangeCell - Function(cardId, archetypeId, valueString) when a cell is edited
 */
function MatchupTable({ cards, archetypes, values = {}, cardTypes = {}, hideLands = false, onChangeCell }) {
  function cellKey(card, archName) {
    const zone = card.zone === 'sideboard' ? 'sideboard' : 'main'
    if (zone === 'sideboard') {
      // New format for sideboard keys so that main-deck and sideboard copies
      // of the same card do not collide.
      return `${card.name}::sideboard::${archName}`
    }
    // Legacy format for maindeck keys, kept for compatibility with existing data.
    return `${card.name}::${archName}`
  }

  const mainDeckCards = sortCardsByGroupThenTypeThenQtyThenName(
    cards.filter((card) => card.zone !== 'sideboard'),
    cardTypes
  )
  const sideboardCards = sortCardsByGroupThenTypeThenQtyThenName(
    cards.filter((card) => card.zone === 'sideboard'),
    cardTypes
  )
  const mainDeckTotal = mainDeckCards.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0)
  const sideboardTotal = sideboardCards.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0)
  const safeArchetypes = Array.isArray(archetypes) ? archetypes : []

  // Only count matchup cells that belong to the current deck (ignore stale keys after deck change).
  // When hideLands, main-deck land rows are not shown — exclude those keys so totals match the table.
  const validMatchupKeys = new Set()
  for (const card of cards) {
    if (!card?.name) continue
    if (
      card.zone !== 'sideboard' &&
      hideLands &&
      getCardGroup(cardTypes[card.name]) === CARD_GROUP_LANDS
    ) {
      continue
    }
    for (const arch of safeArchetypes) {
      validMatchupKeys.add(cellKey(card, arch.name))
    }
  }

  // Per-column totals: for each archetype, sum positive (total in) and negative (total out) in that column.
  const totalInByArch = safeArchetypes.map((arch) => {
    let sum = 0
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      for (const key of Object.keys(values)) {
        if (!validMatchupKeys.has(key)) continue
        if (!key.endsWith(`::${arch.name}`)) continue
        const raw = values[key]
        if (raw === undefined || raw === null || raw === '') continue
        const num = Number.parseInt(String(raw).trim(), 10)
        if (Number.isNaN(num) || num <= 0) continue
        sum += num
      }
    }
    return sum
  })
  const totalOutByArch = safeArchetypes.map((arch) => {
    let sum = 0
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      for (const key of Object.keys(values)) {
        if (!validMatchupKeys.has(key)) continue
        if (!key.endsWith(`::${arch.name}`)) continue
        const raw = values[key]
        if (raw === undefined || raw === null || raw === '') continue
        const num = Number.parseInt(String(raw).trim(), 10)
        if (Number.isNaN(num) || num >= 0) continue
        sum += num
      }
    }
    return sum
  })

  const displayCols = (SHOW_TYPE_GROUP_COLUMNS ? 4 : 2) + Math.max(1, archetypes.length) + 1
  const labelColSpan = displayCols
  const totalsLabelColSpan = SHOW_TYPE_GROUP_COLUMNS ? 4 : 2

  /** % use in known meta: quantity-weighted, excluding "Other". (inSum - outSum) as % of known meta only. */
  function movementPct(card) {
    const isOther = (arch) => String(arch?.name ?? '').trim().toLowerCase() === 'other'
    const knownMetaPct = safeArchetypes
      .filter((a) => !isOther(a))
      .reduce((sum, a) => sum + (Number(a.metagamePercent) || 0), 0)
    if (knownMetaPct <= 0) return 0

    let inSum = 0
    let outSum = 0
    const qty = Number(card.quantity) || 0
    if (qty <= 0 || !values || typeof values !== 'object') return 0
    for (const arch of safeArchetypes) {
      if (isOther(arch)) continue
      const key = cellKey(card, arch.name)
      const raw = values[key]
      if (raw === undefined || raw === null || raw === '') continue
      const num = Number.parseInt(String(raw).trim(), 10)
      if (Number.isNaN(num)) continue
      const pct = Number(arch.metagamePercent) || 0
      const fraction = Math.min(1, Math.abs(num) / qty)
      if (num > 0) inSum += fraction * pct
      else if (num < 0) outSum += fraction * pct
    }
    const rawNet = inSum - outSum
    return Math.round((rawNet / knownMetaPct) * 100)
  }

  function formatMovement(value) {
    if (value > 0) return `+${value}%`
    if (value < 0) return `${value}%`
    return '0%'
  }

  return (
    <div className="matchup-table-wrapper">
      <table
        className="matchup-table"
        style={{ '--table-cols': displayCols }}
      >
        <colgroup>
          <col className="col-card" />
          <col className="col-qty" />
          {SHOW_TYPE_GROUP_COLUMNS && (
            <>
              <col className="col-type" />
              <col className="col-group" />
            </>
          )}
          {archetypes.map((arch) => (
            <col key={arch.name} className="col-arch" />
          ))}
          <col className="col-movement" />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} className="th-card">
              Card
            </th>
            <th rowSpan={2} className="th-qty">
              Qty
            </th>
            {SHOW_TYPE_GROUP_COLUMNS && (
              <>
                <th rowSpan={2} className="th-type">Type</th>
                <th rowSpan={2} className="th-group">Group</th>
              </>
            )}
            {archetypes.map((arch) => {
              const name = arch.name || ''
              const spaceIdx = name.indexOf(' ')
              const twoLines = spaceIdx !== -1
              return (
                <th key={arch.name} className="th-arch-name">
                  {twoLines ? (
                    <>{(name.slice(0, spaceIdx))}<br />{name.slice(spaceIdx + 1)}</>
                  ) : (
                    name || '—'
                  )}
                </th>
              )
            })}
            <th rowSpan={2} className="th-movement">
              % change
            </th>
          </tr>
          <tr>
            {archetypes.map((arch) => (
              <th key={arch.name} className="th-arch-pct">
                ({arch.metagamePercent}%)
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="matchup-section-label matchup-section-main">
            <td className="matchup-section-label-cell" colSpan={labelColSpan}>
              MAIN DECK {mainDeckTotal > 0 ? `(${mainDeckTotal})` : ''}
            </td>
          </tr>
          {GROUP_SORT_ORDER.map((groupLabel) => {
            const cardsInGroup = mainDeckCards.filter(
              (card) => getCardGroup(cardTypes[card.name]) === groupLabel
            )
            if (cardsInGroup.length === 0) return null
            const groupTotal = cardsInGroup.reduce((s, c) => s + (Number(c.quantity) || 0), 0)
            const hideRowsForGroup = hideLands && groupLabel === CARD_GROUP_LANDS
            return (
              <React.Fragment key={`group-${groupLabel}`}>
                <tr className="matchup-group-label">
                  <td className="matchup-group-label-cell" colSpan={labelColSpan}>
                    {groupLabel} {groupTotal > 0 ? `(${groupTotal})` : ''}
                  </td>
                </tr>
                {!hideRowsForGroup &&
                  cardsInGroup.map((card) => {
                    const movement = movementPct(card)
                    return (
                    <tr key={card.id ?? card.name}>
                      <td className="card-name">{card.name}</td>
                      <td>{card.quantity}</td>
                      {SHOW_TYPE_GROUP_COLUMNS && (
                        <>
                          <td className="card-type">{cardTypes[card.name] ?? '—'}</td>
                          <td className="card-group">{getCardGroup(cardTypes[card.name])}</td>
                        </>
                      )}
                      {archetypes.map((arch) => {
                        const primaryKey = cellKey(card, arch.name)
                        const legacyKey =
                          card.zone === 'sideboard' ? `${card.name}::${arch.name}` : primaryKey
                        const value = values[primaryKey] ?? values[legacyKey] ?? ''
                        const num = value === '' ? NaN : Number.parseInt(String(value).trim(), 10)
                        const valueClass = Number.isNaN(num)
                          ? ''
                          : num > 0
                          ? 'matchup-input--positive'
                          : num < 0
                          ? 'matchup-input--negative'
                          : ''
                        return (
                          <td key={arch.name}>
                            <input
                              className={`matchup-input ${valueClass}`}
                              type="text"
                              inputMode="numeric"
                              value={value}
                              onChange={(e) => {
                                const raw = e.target.value
                                if (raw !== '') {
                                  const parsed = Number.parseInt(String(raw).trim(), 10)
                                  if (!Number.isNaN(parsed) && Math.abs(parsed) > (Number(card.quantity) || 0)) {
                                    return
                                  }
                                }
                                onChangeCell?.(primaryKey, arch.name, raw)
                              }}
                              aria-label={`${card.name} vs ${arch.name}`}
                            />
                          </td>
                        )
                      })}
                      <td className={`movement-cell ${movement > 0 ? 'movement-positive' : movement < 0 ? 'movement-negative' : ''}`}>
                        {formatMovement(movement)}
                      </td>
                    </tr>
                  )
                  })}
              </React.Fragment>
            )
          })}

          {sideboardCards.length > 0 && (
            <tr className="matchup-section-label matchup-section-sideboard">
              <td className="matchup-section-label-cell" colSpan={labelColSpan}>
                SIDEBOARD {sideboardTotal > 0 ? `(${sideboardTotal})` : ''}
              </td>
            </tr>
          )}

          {sideboardCards.map((card) => {
            const movement = movementPct(card)
            return (
            <tr key={card.id ?? card.name} className="sideboard-row">
              <td className="card-name">{card.name}</td>
              <td>{card.quantity}</td>
              {SHOW_TYPE_GROUP_COLUMNS && (
                <>
                  <td className="card-type">{cardTypes[card.name] ?? '—'}</td>
                  <td className="card-group">{getCardGroup(cardTypes[card.name])}</td>
                </>
              )}
              {archetypes.map((arch) => {
                const primaryKey = cellKey(card, arch.name)
                /* Sideboard cells use only the sideboard key — do not fall back to main-deck key */
                const value = values[primaryKey] ?? ''
                const num = value === '' ? NaN : Number.parseInt(String(value).trim(), 10)
                const valueClass = Number.isNaN(num) ? '' : num > 0 ? 'matchup-input--positive' : num < 0 ? 'matchup-input--negative' : ''
                return (
                  <td key={arch.name}>
                    <input
                      className={`matchup-input ${valueClass}`}
                      type="text"
                      inputMode="numeric"
                      value={value}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw !== '') {
                          const parsed = Number.parseInt(String(raw).trim(), 10)
                          if (!Number.isNaN(parsed) && Math.abs(parsed) > (Number(card.quantity) || 0)) {
                            return
                          }
                        }
                        onChangeCell?.(primaryKey, arch.name, raw)
                      }}
                      aria-label={`${card.name} vs ${arch.name} (sideboard)`}
                    />
                  </td>
                )
              })}
              <td className={`movement-cell ${movement > 0 ? 'movement-positive' : movement < 0 ? 'movement-negative' : ''}`}>
                {formatMovement(movement)}
              </td>
            </tr>
          )
          })}
        </tbody>
        <tfoot>
          <tr className="matchup-totals-row matchup-totals-row-in">
            <td className="matchup-totals-label" colSpan={totalsLabelColSpan}>
              Total in
            </td>
            {safeArchetypes.map((arch, i) => {
              const hasAnyEntry = totalInByArch[i] !== 0 || totalOutByArch[i] !== 0
              return (
                <td key={arch.name} className="matchup-totals-values">
                  {hasAnyEntry ? (
                    <span className="matchup-totals-number">{totalInByArch[i]}</span>
                  ) : (
                    ''
                  )}
                </td>
              )
            })}
            <td className="matchup-totals-values" />
          </tr>
          <tr className="matchup-totals-row matchup-totals-row-out">
            <td className="matchup-totals-label" colSpan={totalsLabelColSpan}>
              Total out
            </td>
            {safeArchetypes.map((arch, i) => {
              const hasAnyEntry = totalInByArch[i] !== 0 || totalOutByArch[i] !== 0
              return (
                <td key={arch.name} className="matchup-totals-values">
                  {hasAnyEntry ? (
                    <span className="matchup-totals-number">{totalOutByArch[i]}</span>
                  ) : (
                    ''
                  )}
                </td>
              )
            })}
            <td className="matchup-totals-values" />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default MatchupTable
