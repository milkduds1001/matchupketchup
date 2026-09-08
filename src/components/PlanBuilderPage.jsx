/**
 * PlanBuilderPage.jsx — experimental, standalone sideboard-plan builder (see App.jsx's
 * "Sideboard Builder" nav link). An alternative layout/interaction over the same data as Step 4's
 * MatchupCardBoard.jsx: instead of mana-value "piles" collapsed to a single tile + quantity
 * badge, every physical copy of a card is its own large, individually selectable/draggable row
 * (CardStack.jsx), stacked directly on top of each other. Screen is split 50/25/25 — main deck
 * (mana-value columns) | sideboard | In/Out plan zones stacked top/bottom.
 *
 * Selection: click a row to move it instantly (one copy); shift/ctrl/cmd-click a row (or its
 * checkbox) to add it to a multi-card selection instead, or drag a rubber-band box over a panel's
 * background to select everything it touches (see SelectableSurface below). Dragging any selected
 * row then moves the *whole* current selection together — see buildTileDragPayload.
 *
 * This reuses the exact same underlying matchup data (matchupCardAdjust.js + matchupKeys.js) as
 * MatchupCardBoard.jsx, so in/out choices made here show up there too, per archetype and
 * play/draw role, via the same `values`/`onChangeCell` the Dashboard already threads through to
 * Step 4 — this is a different UI over the same plan, not a separate one. Assumes a decklist and
 * metagame are already selected elsewhere (Steps 1-3); App.jsx only renders this page once that's
 * true. Local drag/drop helpers live in utils/cardDragPayload.js (a copy independent of
 * MatchupCardBoard.jsx/CardPile.jsx's own versions, so that file didn't need to change for this).
 */
import { useMemo, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import CardStack from './CardStack.jsx'
import './PlanBuilderPage.css'
import {
  MANA_COLUMN_LANDS,
  MANA_COLUMN_ORDER,
  buildManaColumnMap,
  manaColumnLabel,
  sortCardsByManaThenName,
} from '../utils/manaColumns.js'
import {
  adjustMatchupAssignment,
  getAssignedInCount,
  getAssignedOutCount,
  getAvailableDeckCopies,
  getAvailableSideboardCopies,
} from '../utils/matchupCardAdjust.js'
import {
  buildDragPayload,
  buildMultiDragPayload,
  parseDragPayload,
  findCardByNameZone,
} from '../utils/cardDragPayload.js'

// A drag shorter than this (px) is treated as a plain click on empty space (clears selection)
// rather than an intentional marquee/rubber-band drag.
const MARQUEE_DRAG_THRESHOLD = 4

/**
 * Wraps a panel's card rows so dragging over empty background draws a rubber-band selection box
 * (portaled to document.body so it isn't clipped by the panel's own scroll/overflow) and selects
 * every row it overlaps on mouseup. Clicking empty space without dragging clears the selection.
 * Ignores mousedowns that start on a card row itself (`[data-card-name]`) so normal row
 * click/drag behavior is untouched.
 */
function SelectableSurface({ panel, onSelectRect, onClearSelection, className, children }) {
  const containerRef = useRef(null)
  const [marquee, setMarquee] = useState(null)

  function handleMouseDown(e) {
    if (e.button !== 0 || e.target.closest('[data-card-name]')) return
    const startX = e.clientX
    const startY = e.clientY
    let moved = false

    function rectFrom(x, y) {
      return {
        left: Math.min(startX, x),
        top: Math.min(startY, y),
        width: Math.abs(x - startX),
        height: Math.abs(y - startY),
      }
    }

    function handleMove(ev) {
      if (Math.abs(ev.clientX - startX) > MARQUEE_DRAG_THRESHOLD || Math.abs(ev.clientY - startY) > MARQUEE_DRAG_THRESHOLD) {
        moved = true
      }
      setMarquee(rectFrom(ev.clientX, ev.clientY))
    }

    function handleUp(ev) {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      setMarquee(null)
      if (!moved) {
        onClearSelection?.()
        return
      }
      const finalRect = rectFrom(ev.clientX, ev.clientY)
      const container = containerRef.current
      if (!container) return
      const keys = new Set()
      container.querySelectorAll('[data-card-name]').forEach((node) => {
        const r = node.getBoundingClientRect()
        const overlaps =
          r.left < finalRect.left + finalRect.width &&
          r.left + r.width > finalRect.left &&
          r.top < finalRect.top + finalRect.height &&
          r.top + r.height > finalRect.top
        if (!overlaps) return
        keys.add(`${node.getAttribute('data-card-name')}::${node.getAttribute('data-tile-index')}`)
      })
      onSelectRect?.(panel, keys)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  return (
    <div ref={containerRef} className={className} onMouseDown={handleMouseDown}>
      {children}
      {marquee &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="plan-builder-marquee"
            style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
          />,
          document.body
        )}
    </div>
  )
}

/** One mana-value column of card stacks in the main-deck panel (e.g. all 2-drops). */
function ManaColumnStacks({
  columnKey,
  entries,
  imageUrls,
  onEnsureImage,
  onHover,
  onMove,
  onLeave,
  onActivateCard,
  isSelectedTile,
  onToggleTile,
  buildTileDragPayload,
}) {
  const total = entries.reduce((sum, { available }) => sum + available, 0)
  const label = columnKey === MANA_COLUMN_LANDS ? 'Lands' : `Mana Value ${manaColumnLabel(columnKey)}`
  return (
    <div className={`plan-builder-mana-column${entries.length === 0 ? ' plan-builder-mana-column--empty' : ''}`}>
      <div className="plan-builder-mana-column-label">
        {label} <span className="plan-builder-mana-column-count">({total})</span>
      </div>
      <div className="plan-builder-mana-column-stacks">
        {entries.map(({ card, available }) => (
          <CardStack
            key={`${card.id ?? card.name}-${card.zone}`}
            cardName={card.name}
            quantity={available}
            imageUrl={imageUrls[card.name]}
            imageLoading={imageUrls[card.name] === undefined}
            isSelected={(i) => isSelectedTile(card.name, i)}
            onToggleTile={(i) => onToggleTile(card.name, i)}
            buildTileDragPayload={(i) => buildTileDragPayload(card, i)}
            onActivate={() => onActivateCard?.(card)}
            onEnsureImage={onEnsureImage}
            onHover={onHover}
            onMove={onMove}
            onLeave={onLeave}
          />
        ))}
      </div>
    </div>
  )
}

/** Sideboard panel: one flowing list (a quarter-width column has no room for 9 mana sub-columns), sorted by mana value then name. */
function SideboardStacks({
  entries,
  imageUrls,
  onEnsureImage,
  onHover,
  onMove,
  onLeave,
  onActivateCard,
  isSelectedTile,
  onToggleTile,
  buildTileDragPayload,
}) {
  if (entries.length === 0) {
    return <p className="plan-builder-empty-hint">No sideboard cards available for this matchup.</p>
  }
  return (
    <div className="plan-builder-sideboard-stacks">
      {entries.map(({ card, available }) => (
        <CardStack
          key={`${card.id ?? card.name}-${card.zone}`}
          cardName={card.name}
          quantity={available}
          imageUrl={imageUrls[card.name]}
          imageLoading={imageUrls[card.name] === undefined}
          isSelected={(i) => isSelectedTile(card.name, i)}
          onToggleTile={(i) => onToggleTile(card.name, i)}
          buildTileDragPayload={(i) => buildTileDragPayload(card, i)}
          onActivate={() => onActivateCard?.(card)}
          onEnsureImage={onEnsureImage}
          onHover={onHover}
          onMove={onMove}
          onLeave={onLeave}
        />
      ))}
    </div>
  )
}

/** Top (In) or bottom (Out) half of the plan column — a drop target plus a flowing list of assigned-copy stacks. */
function PlanZoneStacks({
  title,
  tone,
  entries,
  imageUrls,
  onEnsureImage,
  onHover,
  onMove,
  onLeave,
  onActivateCard,
  emptyText,
  onDragOver,
  onDrop,
  isSelectedTile,
  onToggleTile,
  buildTileDragPayload,
}) {
  return (
    <div className={`plan-builder-plan-zone plan-builder-plan-zone--${tone}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="plan-builder-plan-zone-title">{title}</div>
      <div className="plan-builder-plan-zone-body">
        {entries.length === 0 ? (
          <p className="plan-builder-plan-zone-empty">{emptyText}</p>
        ) : (
          <div className="plan-builder-plan-zone-stacks">
            {entries.map(({ card, assigned }) => (
              <CardStack
                key={`${card.id ?? card.name}-${card.zone}`}
                cardName={card.name}
                quantity={assigned}
                imageUrl={imageUrls[card.name]}
                imageLoading={imageUrls[card.name] === undefined}
                isSelected={(i) => isSelectedTile(card.name, i)}
                onToggleTile={(i) => onToggleTile(card.name, i)}
                buildTileDragPayload={(i) => buildTileDragPayload(card, i)}
                onActivate={() => onActivateCard?.(card)}
                onEnsureImage={onEnsureImage}
                onHover={onHover}
                onMove={onMove}
                onLeave={onLeave}
                compact
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PlanBuilderPage({
  decklist,
  metagameName,
  cards = [],
  cardTypes = {},
  cardManaValues = {},
  archetypes = [],
  values = {},
  onChangeCell,
  imageUrls = {},
  onEnsureImage,
  onCardHover,
  onCardMove,
  onCardLeave,
}) {
  // --- State: which archetype (matchup) and play/draw role are currently selected ---
  const safeArchetypes = useMemo(
    () => (Array.isArray(archetypes) ? archetypes : []).filter((a) => a && typeof a.name === 'string' && a.name.trim()),
    [archetypes]
  )

  const [selectedArchName, setSelectedArchName] = useState(() => safeArchetypes[0]?.name ?? '')
  const [selectedRole, setSelectedRole] = useState('play')

  // Fall back to the first archetype if the selected one no longer exists (e.g. renamed/deleted in Step 3).
  const activeArchName = safeArchetypes.some((a) => a.name === selectedArchName)
    ? selectedArchName
    : safeArchetypes[0]?.name ?? ''
  const activeRole = selectedRole === 'draw' ? 'draw' : 'play'

  // -------------------------------------------------------------------------
  // Multi-card selection: which panel currently "owns" a selection, and the exact
  // set of rendered rows (as `${cardName}::${tileIndex}` keys) selected within it.
  // Never spans two panels at once — starting a selection in a different panel
  // replaces the old one. Each row toggles independently (see toggleTile) so
  // selecting is always "one at a time", regardless of which specific copy of a
  // card is clicked — the tiles are visually identical/fungible anyway.
  // -------------------------------------------------------------------------
  const [selection, setSelection] = useState({ panel: null, keys: new Set() })

  const isTileSelected = useCallback(
    (panel, cardName, tileIndex) => selection.panel === panel && selection.keys.has(`${cardName}::${tileIndex}`),
    [selection]
  )

  /** Shift/ctrl/cmd-click (or the row's checkbox): toggle exactly the one row clicked. */
  const toggleTile = useCallback((panel, cardName, tileIndex) => {
    setSelection((prev) => {
      const sameOwner = prev.panel === panel
      const keys = sameOwner ? new Set(prev.keys) : new Set()
      const key = `${cardName}::${tileIndex}`
      if (keys.has(key)) keys.delete(key)
      else keys.add(key)
      return { panel, keys }
    })
  }, [])

  /** Rubber-band select: replace the selection with whatever the drawn box overlapped. */
  const applyRectSelection = useCallback((panel, keys) => {
    setSelection({ panel, keys })
  }, [])

  const clearSelection = useCallback(() => setSelection({ panel: null, keys: new Set() }), [])

  const totalSelected = selection.panel ? selection.keys.size : 0

  /** Aggregate the active selection's exact-row keys into `[{ cardName, count }]` for a multi-drag payload. */
  function selectionCountsByCard() {
    const counts = {}
    for (const key of selection.keys) {
      const cardName = key.slice(0, key.lastIndexOf('::'))
      counts[cardName] = (counts[cardName] || 0) + 1
    }
    return Object.entries(counts).map(([cardName, count]) => ({ cardName, count }))
  }

  /**
   * Drag payload for one tile: if this tile is part of the panel's active selection, drag the
   * *whole* selection together; otherwise fall back to the plain single-card payload.
   */
  const buildTileDragPayload = useCallback(
    (panel, zone, card, tileIndex) => {
      if (isTileSelected(panel, card.name, tileIndex)) {
        const items = selectionCountsByCard()
        if (items.length > 0) return buildMultiDragPayload(panel, zone, items)
      }
      return buildDragPayload(panel, card)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selection, isTileSelected]
  )

  // --- Derived data: split cards by zone, then bucket/sort for the three panels ---
  const mainCards = useMemo(() => (cards || []).filter((c) => c?.zone !== 'sideboard'), [cards])
  const sideboardCards = useMemo(() => (cards || []).filter((c) => c?.zone === 'sideboard'), [cards])

  /** Apply an in/out delta to `card` for the active archetype + play/draw role. */
  const adjust = useCallback(
    (card, delta) => {
      if (!card || !activeArchName) return
      adjustMatchupAssignment(card, activeArchName, activeRole, delta, values, onChangeCell)
    },
    [activeArchName, activeRole, values, onChangeCell]
  )

  /** Apply the same delta (scaled by each item's selected count) to every card in a multi-drag payload. */
  const adjustMany = useCallback(
    (items, zone, sign) => {
      for (const item of items || []) {
        const card = findCardByNameZone(cards, item.cardName, zone)
        if (card && item.count > 0) adjust(card, sign * item.count)
      }
    },
    [cards, adjust]
  )

  const mainColumnMap = useMemo(
    () =>
      buildManaColumnMap(
        mainCards,
        cardTypes,
        cardManaValues,
        false,
        (card) => getAvailableDeckCopies(card, activeArchName, activeRole, values)
      ),
    [mainCards, cardTypes, cardManaValues, activeArchName, activeRole, values]
  )

  const sideboardEntries = useMemo(() => {
    const rows = sideboardCards
      .map((card) => ({ card, available: getAvailableSideboardCopies(card, activeArchName, activeRole, values) }))
      .filter((row) => row.available > 0)
    rows.sort((a, b) => sortCardsByManaThenName(a.card, b.card, cardTypes, cardManaValues))
    return rows
  }, [sideboardCards, activeArchName, activeRole, values, cardTypes, cardManaValues])

  // --- Derived data: cards already assigned Out (main deck) / In (sideboard) for the plan zones ---
  const outEntries = useMemo(() => {
    const rows = mainCards
      .map((card) => ({ card, assigned: getAssignedOutCount(card, activeArchName, activeRole, values) }))
      .filter((row) => row.assigned > 0)
    rows.sort((a, b) => a.card.name.localeCompare(b.card.name))
    return rows
  }, [mainCards, activeArchName, activeRole, values])

  const inEntries = useMemo(() => {
    const rows = sideboardCards
      .map((card) => ({ card, assigned: getAssignedInCount(card, activeArchName, activeRole, values) }))
      .filter((row) => row.assigned > 0)
    rows.sort((a, b) => a.card.name.localeCompare(b.card.name))
    return rows
  }, [sideboardCards, activeArchName, activeRole, values])

  const totalOut = outEntries.reduce((sum, row) => sum + row.assigned, 0)
  const totalIn = inEntries.reduce((sum, row) => sum + row.assigned, 0)
  const totalSideboard = sideboardEntries.reduce((sum, row) => sum + row.available, 0)

  // --- Drag-and-drop: Out accepts main-deck tiles, In accepts sideboard tiles; dropping a
  // plan-zone tile back onto the main-deck or sideboard panel undoes that assignment. Each
  // handler accepts either a single-card payload or a multi-card selection payload. ---

  function allowDrop(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDropOnOut(e) {
    e.preventDefault()
    const payload = parseDragPayload(e)
    if (!payload || payload.source === 'out-zone' || payload.zone !== 'main') return
    if (payload.multi) {
      adjustMany(payload.items, 'main', 1)
      clearSelection()
      return
    }
    const card = findCardByNameZone(cards, payload.cardName, 'main')
    if (card) adjust(card, 1)
  }

  function handleDropOnIn(e) {
    e.preventDefault()
    const payload = parseDragPayload(e)
    if (!payload || payload.source === 'in-zone' || payload.zone !== 'sideboard') return
    if (payload.multi) {
      adjustMany(payload.items, 'sideboard', 1)
      clearSelection()
      return
    }
    const card = findCardByNameZone(cards, payload.cardName, 'sideboard')
    if (card) adjust(card, 1)
  }

  function handleDropReturnToMain(e) {
    e.preventDefault()
    const payload = parseDragPayload(e)
    if (!payload || payload.source !== 'out-zone') return
    if (payload.multi) {
      adjustMany(payload.items, 'main', -1)
      clearSelection()
      return
    }
    const card = findCardByNameZone(cards, payload.cardName, 'main')
    if (card) adjust(card, -1)
  }

  function handleDropReturnToSideboard(e) {
    e.preventDefault()
    const payload = parseDragPayload(e)
    if (!payload || payload.source !== 'in-zone') return
    if (payload.multi) {
      adjustMany(payload.items, 'sideboard', -1)
      clearSelection()
      return
    }
    const card = findCardByNameZone(cards, payload.cardName, 'sideboard')
    if (card) adjust(card, -1)
  }

  // --- Render ---

  if (safeArchetypes.length === 0) {
    return (
      <div className="plan-builder-page plan-builder-page--empty">
        <p className="plan-builder-empty-msg">
          No archetypes yet. Add some in your metagame (Step 3) to start building a plan.
        </p>
      </div>
    )
  }

  return (
    <div className="plan-builder-page">
      <div className="plan-builder-toolbar">
        <div className="plan-builder-toolbar-deck">
          <span className="plan-builder-toolbar-deck-name">{decklist?.name ?? '—'}</span>
          {metagameName ? <span className="plan-builder-toolbar-meta-name">vs. {metagameName}</span> : null}
        </div>
        <label className="plan-builder-toolbar-control">
          Matchup
          <select className="crud-select" value={activeArchName} onChange={(e) => setSelectedArchName(e.target.value)}>
            {safeArchetypes.map((arch) => (
              <option key={arch.name} value={arch.name}>
                {arch.name}
                {arch.metagamePercent != null && arch.metagamePercent !== '' ? ` (${arch.metagamePercent}%)` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="plan-builder-role-toggle" role="group" aria-label="On the play or draw">
          <button
            type="button"
            className={`plan-builder-role-btn${activeRole === 'play' ? ' plan-builder-role-btn--active' : ''}`}
            onClick={() => setSelectedRole('play')}
          >
            On the play
          </button>
          <button
            type="button"
            className={`plan-builder-role-btn${activeRole === 'draw' ? ' plan-builder-role-btn--active' : ''}`}
            onClick={() => setSelectedRole('draw')}
          >
            On the draw
          </button>
        </div>
        {totalSelected > 0 && (
          <div className="plan-builder-selection-status">
            <span>{totalSelected} selected</span>
            <button type="button" className="plan-builder-selection-clear" onClick={clearSelection}>
              Clear
            </button>
          </div>
        )}
        <div className="plan-builder-totals" aria-live="polite">
          <span className="plan-builder-total plan-builder-total--out">
            Out: <strong>{totalOut}</strong>
          </span>
          <span className="plan-builder-total plan-builder-total--in">
            In: <strong>{totalIn}</strong>
          </span>
        </div>
      </div>

      <p className="plan-builder-hint">
        Click a card to move one copy. Shift-click (or its checkmark) to select several, or drag a box over empty
        space to select a group — then drag any selected card to move them all together.
      </p>

      <div className="plan-builder-columns">
        <section
          className="plan-builder-col plan-builder-col--main"
          aria-label="Main deck"
          onDragOver={allowDrop}
          onDrop={handleDropReturnToMain}
        >
          <h3 className="plan-builder-col-title">Main deck</h3>
          <SelectableSurface
            panel="main-deck"
            className="plan-builder-mana-columns"
            onSelectRect={applyRectSelection}
            onClearSelection={clearSelection}
          >
            {MANA_COLUMN_ORDER.map((columnKey) => (
              <ManaColumnStacks
                key={columnKey}
                columnKey={columnKey}
                entries={mainColumnMap.get(columnKey) || []}
                imageUrls={imageUrls}
                onEnsureImage={onEnsureImage}
                onHover={onCardHover}
                onMove={onCardMove}
                onLeave={onCardLeave}
                onActivateCard={(card) => adjust(card, 1)}
                isSelectedTile={(cardName, i) => isTileSelected('main-deck', cardName, i)}
                onToggleTile={(cardName, i) => toggleTile('main-deck', cardName, i)}
                buildTileDragPayload={(card, i) => buildTileDragPayload('main-deck', 'main', card, i)}
              />
            ))}
          </SelectableSurface>
        </section>

        <section
          className="plan-builder-col plan-builder-col--sideboard"
          aria-label="Sideboard"
          onDragOver={allowDrop}
          onDrop={handleDropReturnToSideboard}
        >
          <h3 className="plan-builder-col-title">Sideboard ({totalSideboard})</h3>
          <SelectableSurface
            panel="sideboard"
            className="plan-builder-sideboard-surface"
            onSelectRect={applyRectSelection}
            onClearSelection={clearSelection}
          >
            <SideboardStacks
              entries={sideboardEntries}
              imageUrls={imageUrls}
              onEnsureImage={onEnsureImage}
              onHover={onCardHover}
              onMove={onCardMove}
              onLeave={onCardLeave}
              onActivateCard={(card) => adjust(card, 1)}
              isSelectedTile={(cardName, i) => isTileSelected('sideboard', cardName, i)}
              onToggleTile={(cardName, i) => toggleTile('sideboard', cardName, i)}
              buildTileDragPayload={(card, i) => buildTileDragPayload('sideboard', 'sideboard', card, i)}
            />
          </SelectableSurface>
        </section>

        <section className="plan-builder-col plan-builder-col--plan" aria-label="Sideboard plan">
          <SelectableSurface
            panel="in-zone"
            className="plan-builder-plan-zone-surface"
            onSelectRect={applyRectSelection}
            onClearSelection={clearSelection}
          >
            <PlanZoneStacks
              title="In"
              tone="in"
              entries={inEntries}
              imageUrls={imageUrls}
              onEnsureImage={onEnsureImage}
              onHover={onCardHover}
              onMove={onCardMove}
              onLeave={onCardLeave}
              onActivateCard={(card) => adjust(card, -1)}
              emptyText="Drag sideboard cards here"
              onDragOver={allowDrop}
              onDrop={handleDropOnIn}
              isSelectedTile={(cardName, i) => isTileSelected('in-zone', cardName, i)}
              onToggleTile={(cardName, i) => toggleTile('in-zone', cardName, i)}
              buildTileDragPayload={(card, i) => buildTileDragPayload('in-zone', 'sideboard', card, i)}
            />
          </SelectableSurface>
          <SelectableSurface
            panel="out-zone"
            className="plan-builder-plan-zone-surface"
            onSelectRect={applyRectSelection}
            onClearSelection={clearSelection}
          >
            <PlanZoneStacks
              title="Out"
              tone="out"
              entries={outEntries}
              imageUrls={imageUrls}
              onEnsureImage={onEnsureImage}
              onHover={onCardHover}
              onMove={onCardMove}
              onLeave={onCardLeave}
              onActivateCard={(card) => adjust(card, -1)}
              emptyText="Drag main-deck cards here"
              onDragOver={allowDrop}
              onDrop={handleDropOnOut}
              isSelectedTile={(cardName, i) => isTileSelected('out-zone', cardName, i)}
              onToggleTile={(cardName, i) => toggleTile('out-zone', cardName, i)}
              buildTileDragPayload={(card, i) => buildTileDragPayload('out-zone', 'main', card, i)}
            />
          </SelectableSurface>
        </section>
      </div>
    </div>
  )
}
