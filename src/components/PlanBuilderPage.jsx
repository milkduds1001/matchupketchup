/**
 * PlanBuilderPage.jsx — experimental, standalone sideboard-plan builder (see App.jsx's
 * "Sideboard Builder" nav link). An alternative layout/interaction over the same data as Step 4's
 * MatchupCardBoard.jsx: instead of mana-value "piles" collapsed to a single tile + quantity
 * badge, every physical copy of a card is its own large, individually selectable/draggable row
 * (CardStack.jsx), stacked directly on top of each other. Layout (per a hand-drawn sketch): four
 * separate square, fixed-size tiles — Main deck (bigger; fixed at MAIN_DECK_COLUMNS plain flexbox
 * columns, each mana-value group packed in ascending mana-value order across them — see
 * packInOrder), Outs (pointing right, toward the sideboard) and Ins (pointing left, toward the
 * deck) each fixed at FLOW_ZONE_COLUMNS columns where any card can cascade on any other, and
 * Sideboard as one large-card column. Every tile is the same plain background; content that
 * overflows a tile's fixed size scrolls inside it rather than growing the tile.
 *
 * Both the main-deck and Outs/Ins column splits are done in JS, not CSS `column-count` — an
 * earlier version used multi-column layout for the main deck, but that overflows/scrolls
 * unreliably across browsers and broke visibly (content bleeding into the neighboring tile) on a
 * real decklist with a lopsided curve. Plain flexbox columns computed here don't have that failure
 * mode. Main deck packs its mana-value groups in a fixed order (packInOrder); Outs/Ins assign each
 * card a stable column via a persisted insertion rank (ranksForNames) rather than recomputing from
 * current counts, so cards don't jump between columns as you click cards in and out.
 *
 * Selection: none — this used to support shift/ctrl-click and rubber-band multi-select (drag a
 * whole batch of cards at once), but that's been stripped out (archived in git history, not
 * deleted outright — see the commit that removed it) in favor of a simpler one-at-a-time
 * interaction: click a card to move one copy, or drag a single card to its destination.
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
import CardStack from './CardStack.jsx'
import './PlanBuilderPage.css'
import {
  MANA_COLUMN_LANDS,
  MANA_COLUMN_ORDER,
  MANA_COLUMN_UNKNOWN,
  buildManaColumnMap,
  sortCardsByManaThenName,
} from '../utils/manaColumns.js'
import {
  adjustMatchupAssignment,
  getAssignedInCount,
  getAssignedOutCount,
  getAvailableDeckCopies,
  getAvailableSideboardCopies,
} from '../utils/matchupCardAdjust.js'
import { buildDragPayload, parseDragPayload, findCardByNameZone } from '../utils/cardDragPayload.js'

/** Short column header ("MV3", "Lands", "?") — abbreviated form of manaColumnLabel. */
function shortManaColumnLabel(columnKey) {
  if (columnKey === MANA_COLUMN_LANDS) return 'Lands'
  if (columnKey === MANA_COLUMN_UNKNOWN) return '?'
  return `MV${columnKey}`
}

/**
 * One mana-value column of card stacks in the main-deck panel (e.g. all 2-drops) — copies of the
 * same card cascade, and different cards cascade continuously into each other too (see
 * CardStack.css), so the whole column reads as one unbroken pile.
 */
function ManaColumnStacks({ label, entries, imageUrls, onEnsureImage, onActivateCard, dragSource }) {
  const total = entries.reduce((sum, { available }) => sum + available, 0)
  return (
    <div className="plan-builder-mana-column">
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
            dragPayload={buildDragPayload(dragSource, card)}
            onActivate={() => onActivateCard?.(card)}
            onEnsureImage={onEnsureImage}
          />
        ))}
      </div>
    </div>
  )
}

/** Sideboard panel: one cascading column, sorted by mana value then name. Same card size/sizing
 * constants as every other stack on the page (Main deck, Outs, Ins) — see CardStack.css. */
function SideboardStacks({ entries, imageUrls, onEnsureImage, onActivateCard }) {
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
          dragPayload={buildDragPayload('sideboard', card)}
          onActivate={() => onActivateCard?.(card)}
          onEnsureImage={onEnsureImage}
        />
      ))}
    </div>
  )
}

/**
 * Distributes already-ordered `groups` across up to `columnCount` columns without ever reordering
 * them. Used for Main deck's mana-value columns, where the whole point is that they read in a
 * fixed (ascending mana value) order — a weight-first packer would instead reorder columns by
 * size, which is what used to happen here.
 *
 * Conservative about doubling up: for as long as there are no more groups than columns, every
 * group gets its own column, full stop — no group ever shares a column just because a weight
 * formula decided an earlier column was "full enough" while five more columns sat empty (the
 * previous approach's bug). Only once there are genuinely more groups than columns does merging
 * start, and even then each column's fair share is recomputed from what's actually left after each
 * one closes, so the *last* column doesn't end up absorbing a big leftover pile on its own.
 */
function packInOrder(groups, weightFn, columnCount) {
  if (groups.length <= columnCount) {
    return groups.map((group) => [group])
  }
  const columns = []
  let remaining = groups
  let columnsLeft = columnCount
  while (columnsLeft > 0) {
    if (columnsLeft === 1) {
      columns.push(remaining)
      break
    }
    const target = remaining.reduce((sum, g) => sum + weightFn(g), 0) / columnsLeft
    // However many this column takes, at least 1 must be left for each of the columnsLeft - 1
    // columns still to come — a hard cap, not just a preference, so a weight target that's never
    // quite met can't make this column swallow everything that's left (that was the bug: the old
    // "is it still safe to stop" check only got stricter as more items were taken, so once it
    // failed once it could never pass again, and the loop ran off the end of `remaining`).
    const maxTake = remaining.length - (columnsLeft - 1)
    const current = [remaining[0]]
    let currentWeight = weightFn(remaining[0])
    let i = 1
    while (i < maxTake && currentWeight < target) {
      current.push(remaining[i])
      currentWeight += weightFn(remaining[i])
      i++
    }
    columns.push(current)
    remaining = remaining.slice(i)
    columnsLeft--
  }
  return columns
}

/**
 * Assigns each name in `names` a stable rank within `scopeKey` (persisted in `ranksRef` across
 * renders), so a card keeps the exact same rank — and therefore the same Outs/Ins column and the
 * same position among its column-mates — for as long as it stays assigned, regardless of how any
 * other card's count changes. Previously Outs/Ins were re-sorted by weight (or alphabetically)
 * every render, so cards visibly jumped between columns as you clicked cards in and out; ranks
 * only ever get handed out once, in the order a name first appears. A name no longer present
 * (fully removed) is dropped, so re-adding it later is treated as new — it goes back to the end
 * rather than reserving its old spot forever.
 */
function ranksForNames(ranksRef, scopeKey, names) {
  let scope = ranksRef.current.get(scopeKey)
  if (!scope) {
    scope = { ranks: new Map(), next: 0 }
    ranksRef.current.set(scopeKey, scope)
  }
  const present = new Set(names)
  for (const name of scope.ranks.keys()) {
    if (!present.has(name)) scope.ranks.delete(name)
  }
  for (const name of names) {
    if (!scope.ranks.has(name)) scope.ranks.set(name, scope.next++)
  }
  return scope.ranks
}

const FLOW_ZONE_COLUMNS = 2
const MAIN_DECK_COLUMNS = 6

/**
 * "Outs" (top, pointing right toward the sideboard cards are leaving to) or "Ins" (bottom,
 * pointing left toward the main deck cards are joining) — stacked in their own middle column
 * between the deck and the sideboard, fixed at FLOW_ZONE_COLUMNS columns. Unlike the mana-value
 * columns (where cards group by mana value), any card here can cascade on top of any other —
 * each entry's column is `rank % FLOW_ZONE_COLUMNS` (see ranksForNames), a fixed assignment made
 * once when the card first enters, not recomputed from current counts.
 */
function FlowZoneStacks({
  label,
  arrow,
  tone,
  count,
  entries,
  imageUrls,
  onEnsureImage,
  onActivateCard,
  emptyText,
  onDragOver,
  onDrop,
  dragSource,
}) {
  const columns = useMemo(() => {
    const buckets = Array.from({ length: FLOW_ZONE_COLUMNS }, () => [])
    entries.forEach((entry) => buckets[entry.rank % FLOW_ZONE_COLUMNS].push(entry))
    return buckets
  }, [entries])
  return (
    <div className={`plan-builder-flow-zone plan-builder-flow-zone--${tone}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="plan-builder-flow-zone-title">
        <span className="plan-builder-flow-arrow" aria-hidden="true">{arrow}</span>
        <span>{label}</span>
        <span className="plan-builder-flow-count">({count})</span>
      </div>
      <div className="plan-builder-flow-zone-body">
        {entries.length === 0 ? (
          <p className="plan-builder-flow-zone-empty">{emptyText}</p>
        ) : (
          <div className="plan-builder-flow-zone-stacks">
            {columns.map((columnEntries, columnIndex) => (
              <div className="plan-builder-flow-column" key={columnIndex}>
                {columnEntries.map(({ card, assigned }) => (
                  <CardStack
                    key={`${card.id ?? card.name}-${card.zone}`}
                    cardName={card.name}
                    quantity={assigned}
                    imageUrl={imageUrls[card.name]}
                    imageLoading={imageUrls[card.name] === undefined}
                    dragPayload={buildDragPayload(dragSource, card)}
                    onActivate={() => onActivateCard?.(card)}
                    onEnsureImage={onEnsureImage}
                  />
                ))}
              </div>
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
  keysToMatchup = {},
  onKeysChange,
}) {
  // --- State: which archetype (matchup) and play/draw role are currently selected ---
  const safeArchetypes = useMemo(
    () => (Array.isArray(archetypes) ? archetypes : []).filter((a) => a && typeof a.name === 'string' && a.name.trim()),
    [archetypes]
  )

  const [selectedArchName, setSelectedArchName] = useState(() => safeArchetypes[0]?.name ?? '')
  const [selectedRole, setSelectedRole] = useState('play')
  const notesFieldRef = useRef(null)

  // Fall back to the first archetype if the selected one no longer exists (e.g. renamed/deleted in Step 3).
  const activeArchName = safeArchetypes.some((a) => a.name === selectedArchName)
    ? selectedArchName
    : safeArchetypes[0]?.name ?? ''
  const activeRole = selectedRole === 'draw' ? 'draw' : 'play'

  /** Step through matchups with the toolbar's "< Back" / "Next >" buttons. */
  const activeArchIndex = safeArchetypes.findIndex((a) => a.name === activeArchName)
  const goToArchOffset = (offset) => {
    const next = safeArchetypes[activeArchIndex + offset]
    if (next) setSelectedArchName(next.name)
  }

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

  // Main deck is fixed at MAIN_DECK_COLUMNS columns: each mana-value group (MV0, MV1, ... Lands)
  // is one indivisible unit, packed in ascending-mana-value order (packInOrder) across the
  // columns — never reordered by size, so the columns always read left-to-right in mana-value
  // order. This used to be done with CSS `column-count`, but multi-column overflow/scroll is
  // unreliable across browsers and broke badly on a real, lopsided decklist (one mana value
  // holding 30+ cards) — plain flexbox columns computed in JS don't have that risk.
  const mainDeckColumns = useMemo(() => {
    const groups = MANA_COLUMN_ORDER.map((columnKey) => ({
      columnKey,
      label: shortManaColumnLabel(columnKey),
      entries: mainColumnMap.get(columnKey) || [],
    })).filter((group) => group.entries.length > 0)
    const weightFn = (group) => group.entries.reduce((sum, e) => sum + Math.min(e.available, 5), 0)
    return packInOrder(groups, weightFn, MAIN_DECK_COLUMNS).filter((column) => column.length > 0)
  }, [mainColumnMap])

  const sideboardEntries = useMemo(() => {
    const rows = sideboardCards
      .map((card) => ({ card, available: getAvailableSideboardCopies(card, activeArchName, activeRole, values) }))
      .filter((row) => row.available > 0)
    rows.sort((a, b) => sortCardsByManaThenName(a.card, b.card, cardTypes, cardManaValues))
    return rows
  }, [sideboardCards, activeArchName, activeRole, values, cardTypes, cardManaValues])

  // --- Derived data: cards already assigned Out (main deck) / In (sideboard) for the plan zones.
  // Ordered (and split into Outs/Ins' two columns) by stable insertion rank, not by current count
  // or name — see ranksForNames. ---
  const outRanksRef = useRef(new Map())
  const inRanksRef = useRef(new Map())

  const outEntries = useMemo(() => {
    const rows = mainCards
      .map((card) => ({ card, assigned: getAssignedOutCount(card, activeArchName, activeRole, values) }))
      .filter((row) => row.assigned > 0)
    // ranksForNames only mutates its own cache Map (never drives what this render paints), so
    // reading it mid-render can't tear across a concurrent render the way a ref feeding JSX could.
    // eslint-disable-next-line react-hooks/refs
    const ranks = ranksForNames(outRanksRef, `${activeArchName}::${activeRole}`, rows.map((row) => row.card.name))
    rows.sort((a, b) => ranks.get(a.card.name) - ranks.get(b.card.name))
    return rows.map((row) => ({ ...row, rank: ranks.get(row.card.name) }))
  }, [mainCards, activeArchName, activeRole, values])

  const inEntries = useMemo(() => {
    const rows = sideboardCards
      .map((card) => ({ card, assigned: getAssignedInCount(card, activeArchName, activeRole, values) }))
      .filter((row) => row.assigned > 0)
    // eslint-disable-next-line react-hooks/refs -- see outEntries above.
    const ranks = ranksForNames(inRanksRef, `${activeArchName}::${activeRole}`, rows.map((row) => row.card.name))
    rows.sort((a, b) => ranks.get(a.card.name) - ranks.get(b.card.name))
    return rows.map((row) => ({ ...row, rank: ranks.get(row.card.name) }))
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
    const card = findCardByNameZone(cards, payload.cardName, 'main')
    if (card) adjust(card, 1)
  }

  function handleDropOnIn(e) {
    e.preventDefault()
    const payload = parseDragPayload(e)
    if (!payload || payload.source === 'in-zone' || payload.zone !== 'sideboard') return
    const card = findCardByNameZone(cards, payload.cardName, 'sideboard')
    if (card) adjust(card, 1)
  }

  function handleDropReturnToMain(e) {
    e.preventDefault()
    const payload = parseDragPayload(e)
    if (!payload || payload.source !== 'out-zone') return
    const card = findCardByNameZone(cards, payload.cardName, 'main')
    if (card) adjust(card, -1)
  }

  function handleDropReturnToSideboard(e) {
    e.preventDefault()
    const payload = parseDragPayload(e)
    if (!payload || payload.source !== 'in-zone') return
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
        </div>
        <span className="plan-builder-toolbar-vs">vs.</span>
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
        {metagameName ? <span className="plan-builder-toolbar-meta-name">{metagameName}</span> : null}
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
        <div className="plan-builder-totals" aria-live="polite">
          <span className="plan-builder-total plan-builder-total--out">
            Out: <strong>{totalOut}</strong>
          </span>
          <span className="plan-builder-total plan-builder-total--in">
            In: <strong>{totalIn}</strong>
          </span>
        </div>
        <div className="plan-builder-arch-nav" role="group" aria-label="Previous or next matchup">
          <button
            type="button"
            className="plan-builder-arch-nav-btn"
            onClick={() => goToArchOffset(-1)}
            disabled={activeArchIndex <= 0}
          >
            ← Back
          </button>
          <button
            type="button"
            className="plan-builder-arch-nav-btn"
            onClick={() => goToArchOffset(1)}
            disabled={activeArchIndex < 0 || activeArchIndex >= safeArchetypes.length - 1}
          >
            Next →
          </button>
        </div>
      </div>

      <p className="plan-builder-hint">Click a card to move one copy, or drag it to its destination.</p>

      <div className="plan-builder-board">
        <section
          className="plan-builder-board-main"
          aria-label="Main deck"
          onDragOver={allowDrop}
          onDrop={handleDropReturnToMain}
        >
          <h3 className="plan-builder-col-title">Main deck</h3>
          <div className="plan-builder-mana-columns">
            {mainDeckColumns.map((groupsInColumn, columnIndex) => (
              <div className="plan-builder-mana-super-column" key={columnIndex}>
                {groupsInColumn.map((group) => (
                  <ManaColumnStacks
                    key={group.columnKey}
                    label={group.label}
                    entries={group.entries}
                    imageUrls={imageUrls}
                    onEnsureImage={onEnsureImage}
                    onActivateCard={(card) => adjust(card, 1)}
                    dragSource="main-deck"
                  />
                ))}
              </div>
            ))}
          </div>
        </section>

        <div className="plan-builder-board-mid">
          <FlowZoneStacks
            label="Outs"
            arrow="→"
            tone="out"
            count={totalOut}
            entries={outEntries}
            imageUrls={imageUrls}
            onEnsureImage={onEnsureImage}
            onActivateCard={(card) => adjust(card, -1)}
            emptyText="Drag main-deck cards here"
            onDragOver={allowDrop}
            onDrop={handleDropOnOut}
            dragSource="out-zone"
          />
          <FlowZoneStacks
            label="Ins"
            arrow="←"
            tone="in"
            count={totalIn}
            entries={inEntries}
            imageUrls={imageUrls}
            onEnsureImage={onEnsureImage}
            onActivateCard={(card) => adjust(card, -1)}
            emptyText="Drag sideboard cards here"
            onDragOver={allowDrop}
            onDrop={handleDropOnIn}
            dragSource="in-zone"
          />
        </div>

        <section
          className="plan-builder-board-sideboard"
          aria-label="Sideboard"
          onDragOver={allowDrop}
          onDrop={handleDropReturnToSideboard}
        >
          <h3 className="plan-builder-col-title">Sideboard ({totalSideboard})</h3>
          <div className="plan-builder-sideboard-surface">
            <SideboardStacks
              entries={sideboardEntries}
              imageUrls={imageUrls}
              onEnsureImage={onEnsureImage}
              onActivateCard={(card) => adjust(card, 1)}
            />
          </div>
        </section>
      </div>

      <div className="plan-builder-notes-bar">
        <textarea
          ref={notesFieldRef}
          className="plan-builder-notes-input"
          placeholder="Add notes for this matchup…"
          value={keysToMatchup[activeArchName] ?? ''}
          onChange={(e) => onKeysChange?.(activeArchName, e.target.value)}
        />
        <button
          type="button"
          className="plan-builder-notes-save"
          onClick={() => notesFieldRef.current?.blur()}
        >
          Save
        </button>
      </div>
    </div>
  )
}
