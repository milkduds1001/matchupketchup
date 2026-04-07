import React from 'react'
import './MatchupTable.css'
import { cellKeyForCard } from '../utils/matchupKeys.js'

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

/** Alternating band per archetype master column (play + draw) in thead. */
function archMasterStripClass(archIndex) {
  return archIndex % 2 === 0 ? 'th-arch-master th-arch-master--a' : 'th-arch-master th-arch-master--b'
}

/** Vertical rule between master columns (after each archetype except the last). */
function archDividerAfterClass(archIndex, totalArches) {
  if (totalArches <= 1 || archIndex >= totalArches - 1) return ''
  return 'matchup-arch-divider-after'
}

function getColumnSlots(archetypes) {
  const slots = []
  for (const arch of archetypes) {
    slots.push({ arch, role: 'play' })
    slots.push({ arch, role: 'draw' })
  }
  return slots
}

function cellDisplayValue(values, card, slot) {
  const { arch, role } = slot
  return values[cellKeyForCard(card, arch.name, role)] ?? ''
}

function normalizeCellValueByZone(raw, card) {
  const text = String(raw ?? '').trim()
  if (text === '') return ''
  if (text === '-') return '-'
  const parsed = Number.parseInt(text, 10)
  if (Number.isNaN(parsed)) return null
  const maxQty = Number(card?.quantity) || 0
  const abs = Math.abs(parsed)
  if (maxQty > 0 && abs > maxQty) return null
  if (abs === 0) return '0'
  const signed = card?.zone === 'sideboard' ? abs : -abs
  return String(signed)
}

/**
 * MatchupTable - Renders a table of cards with quantities and editable per-archetype cells.
 * Each archetype has two columns: on the play and on the draw.
 */
function MatchupTable({
  cards,
  archetypes,
  values = {},
  cardTypes = {},
  hideLands = false,
  onChangeCell,
}) {
  function shouldRenderArchetype(arch) {
    const raw = arch?.metagamePercent
    if (raw === '' || raw == null) return true
    const n = Number.parseFloat(String(raw).replace('%', '').trim())
    if (Number.isNaN(n)) return true
    return n > 0
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
  const safeArchetypes = (Array.isArray(archetypes) ? archetypes : []).filter(
    (a) =>
      a != null &&
      typeof a === 'object' &&
      typeof a.name === 'string' &&
      a.name.trim() &&
      shouldRenderArchetype(a)
  )
  const theadRowCount = 2
  const columnSlots = getColumnSlots(safeArchetypes)

  function cardRowVisible(card) {
    if (
      card.zone !== 'sideboard' &&
      hideLands &&
      getCardGroup(cardTypes[card.name]) === CARD_GROUP_LANDS
    ) {
      return false
    }
    return true
  }

  function totalsForVisibleCards(cardList) {
    return columnSlots.map((slot) => {
      let sumIn = 0
      let sumOut = 0
      for (const card of cardList) {
        if (!card?.name || !cardRowVisible(card)) continue
        const raw = cellDisplayValue(values, card, slot)
        if (raw === undefined || raw === null || raw === '') continue
        const num = Number.parseInt(String(raw).trim(), 10)
        if (Number.isNaN(num)) continue
        if (num > 0) sumIn += num
        else if (num < 0) sumOut += num
      }
      return { sumIn, sumOut }
    })
  }

  const mainTotalsBySlot = totalsForVisibleCards([...mainDeckCards, ...sideboardCards])

  const archCount = safeArchetypes.length
  const archColumnCount = columnSlots.length
  const sectionLabelColSpan = SHOW_TYPE_GROUP_COLUMNS ? 3 : 1
  const sectionTailColSpan = archColumnCount + (SHOW_TYPE_GROUP_COLUMNS ? 2 : 0)
  // CSS min-width: avoid zero-width table when counts are tiny (defensive).
  const displayCols = (SHOW_TYPE_GROUP_COLUMNS ? 4 : 2) + Math.max(1, archColumnCount)
  const totalsLabelColSpan = SHOW_TYPE_GROUP_COLUMNS ? 4 : 2

  function renderArchHeadCells() {
    return safeArchetypes.map((arch, archIndex) => {
      const name = arch.name || ''
      const spaceIdx = name.indexOf(' ')
      const twoLines = spaceIdx !== -1
      const nameInner = twoLines ? (
        <>{name.slice(0, spaceIdx)}<br />{name.slice(spaceIdx + 1)}</>
      ) : (
        name || '—'
      )
      const pct =
        arch.metagamePercent != null && arch.metagamePercent !== ''
          ? `(${arch.metagamePercent}%)`
          : ''
      return (
        <th
          key={arch.name}
          colSpan={2}
          className={`th-arch-name th-arch-name-split ${archMasterStripClass(archIndex)} ${archDividerAfterClass(archIndex, archCount)}`}
        >
          <div className="th-arch-name-inner">
            <span className="th-arch-name-lines">{nameInner}</span>
            {pct ? <span className="th-arch-metagame-pct">{pct}</span> : null}
          </div>
        </th>
      )
    })
  }

  function renderPlayDrawSubrow() {
    return (
      <tr className="matchup-thead-playdraw">
        {safeArchetypes.map((arch, archIndex) => (
          <React.Fragment key={arch.name}>
            <th className={`th-playdraw-sub ${archMasterStripClass(archIndex)}`}>Play</th>
            <th
              className={`th-playdraw-sub ${archMasterStripClass(archIndex)} ${archDividerAfterClass(archIndex, archCount)}`}
            >
              draw
            </th>
          </React.Fragment>
        ))}
      </tr>
    )
  }

  function renderDataCells(card) {
    return columnSlots.map((slot) => {
      const { arch, role } = slot
      const archIndex = safeArchetypes.findIndex((a) => a.name === arch.name)
      const dividerAfter =
        role === 'draw' && archIndex >= 0 ? archDividerAfterClass(archIndex, archCount) : ''
      const stripeClass = archIndex % 2 === 0 ? 'matchup-col-stripe--a' : 'matchup-col-stripe--b'
      const primaryKey = cellKeyForCard(card, arch.name, role)
      const value = cellDisplayValue(values, card, slot)
      const num = value === '' ? NaN : Number.parseInt(String(value).trim(), 10)
      const valueClass = Number.isNaN(num)
        ? ''
        : num > 0
        ? 'matchup-input--positive'
        : num < 0
        ? 'matchup-input--negative'
        : ''
      const changeKey = primaryKey
      const aria = `${card.name} vs ${arch.name} (${role === 'play' ? 'on the play' : 'on the draw'})`
      return (
        <td key={`${arch.name}-${role}`} className={`${stripeClass}${dividerAfter ? ` ${dividerAfter}` : ''}`}>
          <input
            className={`matchup-input ${valueClass}`}
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              const next = normalizeCellValueByZone(e.target.value, card)
              if (next == null) return
              onChangeCell?.(changeKey, arch.name, next)
            }}
            aria-label={aria}
          />
        </td>
      )
    })
  }

  if (safeArchetypes.length === 0) {
    return (
      <div className="matchup-table-wrapper matchup-table-wrapper--empty">
        <p className="matchup-table-empty-msg">
          No matchup columns yet. If you just picked a metagame, wait a moment — or open &quot;Add or modify metagames&quot;
          and add at least one archetype with a name.
        </p>
      </div>
    )
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
          {columnSlots.map((slot) => (
            <col key={`${slot.arch.name}-${slot.role}`} className="col-arch" />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={theadRowCount} className="th-card" aria-label="Card column" />
            <th rowSpan={theadRowCount} className="th-qty" aria-label="Quantity column" />
            {SHOW_TYPE_GROUP_COLUMNS && (
              <>
                <th rowSpan={theadRowCount} className="th-type">Type</th>
                <th rowSpan={theadRowCount} className="th-group">Group</th>
              </>
            )}
            {renderArchHeadCells()}
          </tr>
          {renderPlayDrawSubrow()}
        </thead>
        <tbody>
          <tr className="matchup-section-label matchup-section-main">
            <td className="matchup-section-label-cell" colSpan={sectionLabelColSpan}>MAIN DECK</td>
            <td className="matchup-section-total-cell">{mainDeckTotal > 0 ? mainDeckTotal : ''}</td>
            <td className="matchup-section-fill-cell" colSpan={sectionTailColSpan} />
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
                  <td className="matchup-group-label-cell" colSpan={sectionLabelColSpan}>{groupLabel}</td>
                  <td className="matchup-group-total-cell">{groupTotal > 0 ? groupTotal : ''}</td>
                  <td className="matchup-group-fill-cell" colSpan={sectionTailColSpan} />
                </tr>
                {!hideRowsForGroup &&
                  cardsInGroup.map((card) => (
                    <tr key={card.id ?? card.name}>
                      <td className="card-name">{card.name}</td>
                      <td>{card.quantity}</td>
                      {SHOW_TYPE_GROUP_COLUMNS && (
                        <>
                          <td className="card-type">{cardTypes[card.name] ?? '—'}</td>
                          <td className="card-group">{getCardGroup(cardTypes[card.name])}</td>
                        </>
                      )}
                      {renderDataCells(card)}
                    </tr>
                  ))}
              </React.Fragment>
            )
          })}

          {sideboardCards.length > 0 && (
            <tr className="matchup-section-label matchup-section-sideboard">
              <td className="matchup-section-label-cell" colSpan={sectionLabelColSpan}>SIDEBOARD</td>
              <td className="matchup-section-total-cell">{sideboardTotal > 0 ? sideboardTotal : ''}</td>
              <td className="matchup-section-fill-cell" colSpan={sectionTailColSpan} />
            </tr>
          )}

          {sideboardCards.map((card) => (
            <tr key={card.id ?? card.name} className="sideboard-row">
              <td className="card-name">{card.name}</td>
              <td>{card.quantity}</td>
              {SHOW_TYPE_GROUP_COLUMNS && (
                <>
                  <td className="card-type">{cardTypes[card.name] ?? '—'}</td>
                  <td className="card-group">{getCardGroup(cardTypes[card.name])}</td>
                </>
              )}
              {renderDataCells(card)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="matchup-totals-row matchup-totals-row-in">
            <td className="matchup-totals-label" colSpan={totalsLabelColSpan}>
              Total in
            </td>
            {columnSlots.map((slot, i) => {
              const { sumIn, sumOut } = mainTotalsBySlot[i] || { sumIn: 0, sumOut: 0 }
              const hasAnyEntry = sumIn !== 0 || sumOut !== 0
              const ai = safeArchetypes.findIndex((a) => a.name === slot.arch.name)
              const divAfter =
                slot.role === 'draw' && ai >= 0 ? archDividerAfterClass(ai, archCount) : ''
              return (
                <td
                  key={`${slot.arch.name}-${slot.role}-in`}
                  className={`matchup-totals-values${divAfter ? ` ${divAfter}` : ''}`}
                >
                  {hasAnyEntry ? (
                    <span className="matchup-totals-number">{sumIn}</span>
                  ) : (
                    ''
                  )}
                </td>
              )
            })}
          </tr>
          <tr className="matchup-totals-row matchup-totals-row-out">
            <td className="matchup-totals-label" colSpan={totalsLabelColSpan}>
              Total out
            </td>
            {columnSlots.map((slot, i) => {
              const { sumIn, sumOut } = mainTotalsBySlot[i] || { sumIn: 0, sumOut: 0 }
              const hasAnyEntry = sumIn !== 0 || sumOut !== 0
              const ai = safeArchetypes.findIndex((a) => a.name === slot.arch.name)
              const divAfter =
                slot.role === 'draw' && ai >= 0 ? archDividerAfterClass(ai, archCount) : ''
              return (
                <td
                  key={`${slot.arch.name}-${slot.role}-out`}
                  className={`matchup-totals-values${divAfter ? ` ${divAfter}` : ''}`}
                >
                  {hasAnyEntry ? (
                    <span className="matchup-totals-number">{Math.abs(sumOut)}</span>
                  ) : (
                    ''
                  )}
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default MatchupTable
