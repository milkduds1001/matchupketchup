// ---------------------------------------------------------------------------
// MatchupTable
//
// Renders the sideboard matchup matrix (cards x archetypes, with an "on the
// play" / "on the draw" sub-column per archetype) as a plain HTML <table>.
//
// This component exists specifically for print/PDF output: App.jsx mounts it
// inside a `.matchup-matrix-print-only` wrapper (aria-hidden, hidden by CSS
// except when `body.print-mode-matrix` is active — see App.css) so that
// printing the matchup step yields a clean, paginated table instead of the
// interactive board. The actual on-screen editing UI is its sibling
// MatchupCardBoard.jsx, a drag/drop-capable board that this file intentionally
// does not try to match pixel-for-pixel. Because it's rendered (just hidden)
// during normal use, it still wires up the same handlers as the interactive
// board (onChangeCell, hover/move/leave, keyboard grid navigation) so the
// printed values and behavior stay in sync with the live board.
// ---------------------------------------------------------------------------
import React, { useRef, useLayoutEffect, useCallback, useMemo } from 'react'
import './MatchupTable.css'
import { cellKeyForCard } from '../utils/matchupKeys.js'
import {
  CARD_GROUP_LANDS,
  GROUP_ORDER_MAP,
  GROUP_SORT_ORDER,
  getCardGroup,
} from '../utils/cardGrouping.js'

// ---------------------------------------------------------------------------
// Card sorting / grouping helpers
// ---------------------------------------------------------------------------

/**
 * Sort by group first (Creatures & Planeswalkers > Other Spells > Lands),
 * then by descending quantity within the group, then alphabetically by name.
 */
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

// Feature flag: an extra "Type" / "Group" column pair kept in the markup for
// future use (colgroup, colSpans, and thead already account for it) but
// disabled for now — flip to true to re-enable those columns.
const SHOW_TYPE_GROUP_COLUMNS = false

// ---------------------------------------------------------------------------
// Header/column layout helpers (sticky bands, archetype dividers, cell keys)
// ---------------------------------------------------------------------------

/** Alternating band per archetype master column (play + draw) in thead. */
function archMasterStripClass(archIndex) {
  return archIndex % 2 === 0 ? 'th-arch-master th-arch-master--a' : 'th-arch-master th-arch-master--b'
}

/** Vertical rule between master columns (after each archetype except the last). */
function archDividerAfterClass(archIndex, totalArches) {
  if (totalArches <= 1 || archIndex >= totalArches - 1) return ''
  return 'matchup-arch-divider-after'
}

/** Expand each archetype into its "play" and "draw" sub-columns, in display order. */
function getColumnSlots(archetypes) {
  const slots = []
  for (const arch of archetypes) {
    slots.push({ arch, role: 'play' })
    slots.push({ arch, role: 'draw' })
  }
  return slots
}

/** Look up the stored in/out value for one card x archetype/play-or-draw cell. */
function cellDisplayValue(values, card, slot) {
  const { arch, role } = slot
  return values[cellKeyForCard(card, arch.name, role)] ?? ''
}

/**
 * Parse/clamp a raw cell input into the stored value format.
 * Values are stored signed: main-deck cards use negative (cards leaving the
 * deck), sideboard cards use positive (cards coming in). The zone flips the
 * sign of whatever the user typed so they can always type a plain count.
 * Returns null when the input isn't a usable number, or exceeds the card's
 * quantity, so the caller can reject the edit.
 */
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

/** Stable id for grid row index (main vs sideboard, id vs name). */
function matchupNavRowKey(card) {
  const zone = card?.zone === 'sideboard' ? 'sideboard' : 'main'
  return `${card?.id ?? card?.name}|${zone}`
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
  onCardHover,
  onCardMove,
  onCardLeave,
}) {
  // -------------------------------------------------------------------------
  // Data derivation: split/sort cards into main-deck vs sideboard, filter and
  // sort archetype columns.
  // -------------------------------------------------------------------------

  /** Skip archetypes explicitly pinned at 0% metagame share (blank/invalid % still shows). */
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

  // -------------------------------------------------------------------------
  // Keyboard grid navigation: build the flat, visible-row order the arrow
  // keys move through (main-deck groups in display order, then sideboard),
  // then map card -> row index so cell inputs can look up their neighbors.
  // -------------------------------------------------------------------------

  /** Rows visible in the grid: same land-hiding rule used for rendering below. */
  const navigableCards = useMemo(() => {
    const rows = []
    const rowVisible = (card) => {
      if (
        card.zone !== 'sideboard' &&
        hideLands &&
        getCardGroup(cardTypes[card.name]) === CARD_GROUP_LANDS
      ) {
        return false
      }
      return true
    }
    for (const groupLabel of GROUP_SORT_ORDER) {
      const cardsInGroup = mainDeckCards.filter(
        (card) => getCardGroup(cardTypes[card.name]) === groupLabel
      )
      if (cardsInGroup.length === 0) continue
      const hideRowsForGroup = hideLands && groupLabel === CARD_GROUP_LANDS
      if (hideRowsForGroup) continue
      for (const card of cardsInGroup) {
        if (!rowVisible(card)) continue
        rows.push(card)
      }
    }
    for (const card of sideboardCards) {
      rows.push(card)
    }
    return rows
  }, [mainDeckCards, sideboardCards, cardTypes, hideLands])

  const rowIndexByCardKey = useMemo(() => {
    const m = new Map()
    navigableCards.forEach((card, i) => {
      m.set(matchupNavRowKey(card), i)
    })
    return m
  }, [navigableCards])

  /** Registry of live cell <input> DOM nodes, keyed by "rowIndex,colIndex". */
  const cellRefMap = useRef(new Map())
  const setCellInputRef = useCallback((rowIndex, colIndex, el) => {
    const k = `${rowIndex},${colIndex}`
    if (el) cellRefMap.current.set(k, el)
    else cellRefMap.current.delete(k)
  }, [])

  /** Focus a cell input by grid position and place the caret at start/end. */
  const focusCellInput = useCallback((rowIndex, colIndex, cursor = 'end') => {
    const el = cellRefMap.current.get(`${rowIndex},${colIndex}`)
    if (!el) return
    el.focus()
    const len = el.value.length
    if (cursor === 'start') el.setSelectionRange(0, 0)
    else if (cursor === 'end') el.setSelectionRange(len, len)
  }, [])

  /**
   * Arrow-key navigation between cell inputs: up/down moves a row regardless
   * of caret position; left/right moves a column only when the caret is
   * already at that edge of the text (so normal text-caret movement inside a
   * cell still works).
   */
  function handleMatchupCellKeyDown(e, rowIndex, colIndex) {
    const nRows = navigableCards.length
    const nCols = columnSlots.length
    if (nRows === 0 || nCols === 0) return

    if (e.key === 'ArrowDown') {
      if (rowIndex < nRows - 1) {
        e.preventDefault()
        focusCellInput(rowIndex + 1, colIndex, 'end')
      }
      return
    }
    if (e.key === 'ArrowUp') {
      if (rowIndex > 0) {
        e.preventDefault()
        focusCellInput(rowIndex - 1, colIndex, 'end')
      }
      return
    }

    const input = e.target
    if (!(input instanceof HTMLInputElement)) return

    if (e.key === 'ArrowRight') {
      const atEnd =
        input.selectionStart === input.value.length && input.selectionEnd === input.value.length
      if (atEnd && colIndex < nCols - 1) {
        e.preventDefault()
        focusCellInput(rowIndex, colIndex + 1, 'start')
      }
      return
    }
    if (e.key === 'ArrowLeft') {
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0
      if (atStart && colIndex > 0) {
        e.preventDefault()
        focusCellInput(rowIndex, colIndex - 1, 'end')
      }
    }
  }

  // -------------------------------------------------------------------------
  // Column totals: "Total in" / "Total out" tfoot rows, summed only over
  // main-deck/sideboard cards actually shown (respects hideLands).
  // -------------------------------------------------------------------------

  /** Same land-hiding rule as navigableCards, applied when summing totals. */
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

  /** Per-column sum of positive (in) and negative (out) values across visible cards. */
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

  // Shared column/colSpan counts used by both the thead and the section rows below.
  const archCount = safeArchetypes.length
  const archColumnCount = columnSlots.length
  const sectionLabelColSpan = SHOW_TYPE_GROUP_COLUMNS ? 3 : 1
  const sectionTailColSpan = archColumnCount + (SHOW_TYPE_GROUP_COLUMNS ? 2 : 0)
  // CSS min-width: avoid zero-width table when counts are tiny (defensive).
  const displayCols = (SHOW_TYPE_GROUP_COLUMNS ? 4 : 2) + Math.max(1, archColumnCount)
  const totalsLabelColSpan = SHOW_TYPE_GROUP_COLUMNS ? 4 : 2

  // -------------------------------------------------------------------------
  // Sticky header/column geometry: the thead and the "MAIN DECK" section row
  // stick to the top while scrolling, and their heights vary with content
  // (archetype name wrapping, font size, etc). We measure the live DOM and
  // publish the results as CSS custom properties so MatchupTable.css can
  // offset the sticky rows/columns correctly instead of hardcoding heights.
  // -------------------------------------------------------------------------

  const scrollRef = useRef(null)
  const theadRef = useRef(null)
  const sectionMainRowRef = useRef(null)

  /** Measure thead row heights + the sticky "MAIN DECK" row and write them as CSS vars on the scroll wrapper. */
  const syncStickyLayoutVars = useCallback(() => {
    const wrap = scrollRef.current
    const thead = theadRef.current
    if (!wrap || !thead) return
    const theadRect = thead.getBoundingClientRect()
    const tr2 = thead.querySelector('tr:nth-child(2)')
    if (!tr2) return
    const tr2Rect = tr2.getBoundingClientRect()
    /* Row 1 height from geometry (robust with rowspan on card/qty cells) */
    const h1 = Math.max(0, tr2Rect.top - theadRect.top)
    const h2 = tr2Rect.height
    if (h1 > 0) wrap.style.setProperty('--matchup-thead-row1-height', `${h1}px`)
    if (h2 > 0) wrap.style.setProperty('--matchup-thead-row2-height', `${h2}px`)
    if (theadRect.height > 0) {
      wrap.style.setProperty('--matchup-thead-sticky-bottom', `${theadRect.height}px`)
    }
    const mainRow = sectionMainRowRef.current
    if (mainRow) {
      const mh = mainRow.getBoundingClientRect().height
      if (mh > 0) wrap.style.setProperty('--matchup-section-main-height', `${mh}px`)
    }
  }, [])

  useLayoutEffect(() => {
    syncStickyLayoutVars()
    const thead = theadRef.current
    const mainRow = sectionMainRowRef.current
    const wrap = scrollRef.current
    if (!thead || !wrap) return undefined
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(syncStickyLayoutVars)
    })
    ro.observe(thead)
    if (mainRow) ro.observe(mainRow)
    window.addEventListener('resize', syncStickyLayoutVars)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncStickyLayoutVars)
    }
  }, [syncStickyLayoutVars, safeArchetypes, archColumnCount])

  // -------------------------------------------------------------------------
  // JSX render helpers: thead cells (archetype names, play/draw sub-row) and
  // the filler cells that keep section/group label rows aligned with the
  // archetype columns below them.
  // -------------------------------------------------------------------------

  /** One <td> per archetype play/draw column so gold dividers align with card rows (when type columns off). */
  function renderArchSpanFillCells(variant) {
    return columnSlots.map((slot, slotIndex) => {
      const archIndex = Math.floor(slotIndex / 2)
      const dividerAfter =
        slot.role === 'draw' && archIndex < archCount - 1 ? archDividerAfterClass(archIndex, archCount) : ''
      /* Do not use matchup-arch-cell here — it sets background:transparent and shows colgroup beige through */
      let extra = ''
      if (variant === 'section-main') {
        extra = 'matchup-section-fill-arch matchup-section-fill-arch--main'
      } else if (variant === 'section-sideboard') {
        extra = 'matchup-section-fill-arch matchup-section-fill-arch--sideboard'
      } else {
        extra = 'matchup-group-fill-arch'
      }
      return (
        <td
          key={`${variant}-${slot.arch.name}-${slot.role}`}
          className={`${extra}${dividerAfter ? ` ${dividerAfter}` : ''}`.trim()}
          aria-hidden="true"
        />
      )
    })
  }

  /** Archetype master header cell (colSpan 2, covers play+draw); wraps the name onto two lines at its first space. */
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

  /** Second thead row: "Play" / "draw" labels under each archetype's master header cell. */
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

  /**
   * One editable in/out <input> per archetype play/draw column for a card
   * row. Wires up grid keyboard navigation (via rowIndexByCardKey) only when
   * the row is part of the navigable set; otherwise renders a plain
   * uncontrolled-nav input.
   */
  function renderDataCells(card) {
    const rowIndex = rowIndexByCardKey.get(matchupNavRowKey(card))
    const gridNav = rowIndex !== undefined
    return columnSlots.map((slot, slotIndex) => {
      const { arch, role } = slot
      const archIndex = Math.floor(slotIndex / 2)
      const dividerAfter =
        role === 'draw' && archIndex >= 0 ? archDividerAfterClass(archIndex, archCount) : ''
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
        <td key={`${arch.name}-${role}`} className={`matchup-arch-cell${dividerAfter ? ` ${dividerAfter}` : ''}`}>
          <input
            className={`matchup-input ${valueClass}`}
            type="text"
            inputMode="numeric"
            value={value}
            ref={
              gridNav
                ? (el) => {
                    setCellInputRef(rowIndex, slotIndex, el)
                  }
                : undefined
            }
            onChange={(e) => {
              const next = normalizeCellValueByZone(e.target.value, card)
              if (next == null) return
              onChangeCell?.(changeKey, arch.name, next)
            }}
            onKeyDown={
              gridNav
                ? (e) => {
                    handleMatchupCellKeyDown(e, rowIndex, slotIndex)
                  }
                : undefined
            }
            aria-label={aria}
          />
        </td>
      )
    })
  }

  /**
   * Leading, non-archetype cells shared by every card row (main-deck and
   * sideboard alike): the hoverable card-name button, the quantity, and the
   * optional type/group columns. Pulled out to avoid duplicating this block
   * between the main-deck and sideboard row-mapping below.
   */
  function renderCardLeadCells(card) {
    return (
      <>
        <td className="card-name matchup-sticky-col matchup-sticky-col--1">
          <button
            type="button"
            className="matchup-card-preview-trigger"
            onMouseEnter={(e) => onCardHover?.(card.name, e)}
            onMouseMove={(e) => onCardMove?.(e)}
            onFocus={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              onCardHover?.(card.name, { clientX: r.right + 8, clientY: r.top + 4 })
            }}
            onMouseLeave={() => onCardLeave?.()}
            onBlur={() => onCardLeave?.()}
          >
            {card.name}
          </button>
        </td>
        <td className="matchup-sticky-col matchup-sticky-col--2">{card.quantity}</td>
        {SHOW_TYPE_GROUP_COLUMNS && (
          <>
            <td className="card-type">{cardTypes[card.name] ?? '—'}</td>
            <td className="card-group">{getCardGroup(cardTypes[card.name])}</td>
          </>
        )}
      </>
    )
  }

  if (safeArchetypes.length === 0) {
    return (
      <div className="matchup-table-scroll matchup-table-scroll--empty">
        <div className="matchup-table-wrapper matchup-table-wrapper--empty">
          <p className="matchup-table-empty-msg">
            No matchup columns yet. If you just picked a metagame, wait a moment — or open &quot;Add or modify metagames&quot;
            and add at least one archetype with a name.
          </p>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Table JSX: colgroup (sticky column widths + archetype banding), thead
  // (archetype names + play/draw sub-row), tbody (MAIN DECK section, grouped
  // card rows, SIDEBOARD section, sideboard card rows), tfoot (in/out totals).
  // -------------------------------------------------------------------------

  return (
    <div ref={scrollRef} className="matchup-table-scroll">
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
          {columnSlots.map((slot, slotIndex) => {
            const archIndex = Math.floor(slotIndex / 2)
            const bandClass = archIndex % 2 === 0 ? 'col-arch-band-a' : 'col-arch-band-b'
            return <col key={`${slot.arch.name}-${slot.role}`} className={`col-arch ${bandClass}`} />
          })}
        </colgroup>
        <thead ref={theadRef} className="matchup-thead">
          <tr>
            <th rowSpan={theadRowCount} className="th-card matchup-sticky-col matchup-sticky-col--1" aria-label="Card column" />
            <th rowSpan={theadRowCount} className="th-qty matchup-sticky-col matchup-sticky-col--2" aria-label="Quantity column" />
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
          <tr ref={sectionMainRowRef} className="matchup-section-label matchup-section-main">
            <td className="matchup-section-label-cell matchup-sticky-col matchup-sticky-col--1" colSpan={sectionLabelColSpan}>MAIN DECK</td>
            <td className="matchup-section-total-cell matchup-sticky-col matchup-sticky-col--2">{mainDeckTotal > 0 ? mainDeckTotal : ''}</td>
            {SHOW_TYPE_GROUP_COLUMNS ? (
              <td className="matchup-section-fill-cell" colSpan={sectionTailColSpan} />
            ) : (
              renderArchSpanFillCells('section-main')
            )}
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
                  <td className="matchup-group-label-cell matchup-sticky-col matchup-sticky-col--1" colSpan={sectionLabelColSpan}>{groupLabel}</td>
                  <td className="matchup-group-total-cell matchup-sticky-col matchup-sticky-col--2">{groupTotal > 0 ? groupTotal : ''}</td>
                  {SHOW_TYPE_GROUP_COLUMNS ? (
                    <td className="matchup-group-fill-cell" colSpan={sectionTailColSpan} />
                  ) : (
                    renderArchSpanFillCells('group')
                  )}
                </tr>
                {!hideRowsForGroup &&
                  cardsInGroup.map((card) => (
                    <tr key={card.id ?? card.name}>
                      {renderCardLeadCells(card)}
                      {renderDataCells(card)}
                    </tr>
                  ))}
              </React.Fragment>
            )
          })}

          {sideboardCards.length > 0 && (
            <tr className="matchup-section-label matchup-section-sideboard">
              <td className="matchup-section-label-cell matchup-sticky-col matchup-sticky-col--1" colSpan={sectionLabelColSpan}>SIDEBOARD</td>
              <td className="matchup-section-total-cell matchup-sticky-col matchup-sticky-col--2">{sideboardTotal > 0 ? sideboardTotal : ''}</td>
              {SHOW_TYPE_GROUP_COLUMNS ? (
                <td className="matchup-section-fill-cell" colSpan={sectionTailColSpan} />
              ) : (
                renderArchSpanFillCells('section-sideboard')
              )}
            </tr>
          )}

          {sideboardCards.map((card) => (
            <tr key={card.id ?? card.name} className="sideboard-row">
              {renderCardLeadCells(card)}
              {renderDataCells(card)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="matchup-totals-row matchup-totals-row-in">
            <td className="matchup-totals-label matchup-sticky-col matchup-sticky-col--span2" colSpan={totalsLabelColSpan}>
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
                  className={`matchup-totals-values matchup-arch-cell${divAfter ? ` ${divAfter}` : ''}`}
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
            <td className="matchup-totals-label matchup-sticky-col matchup-sticky-col--span2" colSpan={totalsLabelColSpan}>
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
                  className={`matchup-totals-values matchup-arch-cell${divAfter ? ` ${divAfter}` : ''}`}
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
    </div>
  )
}

export default MatchupTable
