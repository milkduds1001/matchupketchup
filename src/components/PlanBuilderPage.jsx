/**
 * PlanBuilderPage.jsx — experimental, standalone sideboard-plan builder (see App.jsx's
 * "Sideboard Builder" nav link). An alternative layout/interaction over the same data as Step 4's
 * MatchupCardBoard.jsx: instead of mana-value "piles" collapsed to a single tile + quantity
 * badge, every physical copy of a card is its own draggable tile (CardStack.jsx), fanned out so
 * you can see exactly how many copies you have. Screen is split 50/25/25 — main deck (mana-value
 * columns) | sideboard | In/Out plan zones stacked top/bottom.
 *
 * This reuses the exact same underlying matchup data (matchupCardAdjust.js + matchupKeys.js) as
 * MatchupCardBoard.jsx, so in/out choices made here show up there too, per archetype and
 * play/draw role, via the same `values`/`onChangeCell` the Dashboard already threads through to
 * Step 4 — this is a different UI over the same plan, not a separate one. Assumes a decklist and
 * metagame are already selected elsewhere (Steps 1-3); App.jsx only renders this page once that's
 * true. Local drag/drop helpers live in utils/cardDragPayload.js (a copy independent of
 * MatchupCardBoard.jsx/CardPile.jsx's own versions, so that file didn't need to change for this).
 */
import { useMemo, useState, useCallback } from 'react'
import CardStack from './CardStack.jsx'
import './PlanBuilderPage.css'
import {
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
import { buildDragPayload, parseDragPayload, findCardByNameZone } from '../utils/cardDragPayload.js'

/** One mana-value column of card stacks in the main-deck panel (e.g. all 2-drops). */
function ManaColumnStacks({ columnKey, entries, imageUrls, onEnsureImage, onHover, onMove, onLeave, onActivateCard }) {
  return (
    <div className={`plan-builder-mana-column${entries.length === 0 ? ' plan-builder-mana-column--empty' : ''}`}>
      <div className="plan-builder-mana-column-label">{manaColumnLabel(columnKey)}</div>
      <div className="plan-builder-mana-column-stacks">
        {entries.map(({ card, available }) => (
          <CardStack
            key={`${card.id ?? card.name}-${card.zone}`}
            cardName={card.name}
            quantity={available}
            imageUrl={imageUrls[card.name]}
            imageLoading={imageUrls[card.name] === undefined}
            dragPayload={buildDragPayload('main-deck', card)}
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
function SideboardStacks({ entries, imageUrls, onEnsureImage, onHover, onMove, onLeave, onActivateCard }) {
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
          onHover={onHover}
          onMove={onMove}
          onLeave={onLeave}
          compact
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
                dragPayload={buildDragPayload(tone === 'in' ? 'in-zone' : 'out-zone', card)}
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

  // --- Drag-and-drop: Out accepts main-deck tiles, In accepts sideboard tiles; dropping a
  // plan-zone tile back onto the main-deck or sideboard panel undoes that assignment. ---

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
        <div className="plan-builder-totals" aria-live="polite">
          <span className="plan-builder-total plan-builder-total--out">
            Out: <strong>{totalOut}</strong>
          </span>
          <span className="plan-builder-total plan-builder-total--in">
            In: <strong>{totalIn}</strong>
          </span>
        </div>
      </div>

      <div className="plan-builder-columns">
        <section
          className="plan-builder-col plan-builder-col--main"
          aria-label="Main deck"
          onDragOver={allowDrop}
          onDrop={handleDropReturnToMain}
        >
          <h3 className="plan-builder-col-title">Main deck</h3>
          <div className="plan-builder-mana-columns">
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
              />
            ))}
          </div>
        </section>

        <section
          className="plan-builder-col plan-builder-col--sideboard"
          aria-label="Sideboard"
          onDragOver={allowDrop}
          onDrop={handleDropReturnToSideboard}
        >
          <h3 className="plan-builder-col-title">Sideboard</h3>
          <SideboardStacks
            entries={sideboardEntries}
            imageUrls={imageUrls}
            onEnsureImage={onEnsureImage}
            onHover={onCardHover}
            onMove={onCardMove}
            onLeave={onCardLeave}
            onActivateCard={(card) => adjust(card, 1)}
          />
        </section>

        <section className="plan-builder-col plan-builder-col--plan" aria-label="Sideboard plan">
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
          />
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
          />
        </section>
      </div>
    </div>
  )
}
