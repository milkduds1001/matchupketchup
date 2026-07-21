/**
 * MatchupCardBoard.jsx — interactive, drag-and-drop board for building a sideboard plan.
 *
 * For the selected archetype + on-the-play/on-the-draw role, main-deck and sideboard cards are
 * laid out in mana-value columns (grouped by src/utils/manaColumns.js) as draggable "piles"
 * (CardPile.jsx). Dragging or clicking a pile moves copies into the "Out" or "In" plan zones;
 * the actual in/out counts for the matchup matrix are read and written through
 * src/utils/matchupCardAdjust.js, which stores them as signed strings keyed via
 * src/utils/matchupKeys.js. This is a more visual, alternative UI over the same underlying
 * matchup data as src/components/MatchupTable.jsx (the plain-table view).
 */
import { useMemo, useState, useCallback } from 'react'
import CardPile from './CardPile.jsx'
import './MatchupCardBoard.css'
import {
  MANA_COLUMN_ORDER,
  buildManaColumnMap,
  manaColumnLabel,
} from '../utils/manaColumns.js'
import {
  adjustMatchupAssignment,
  getAssignedInCount,
  getAssignedOutCount,
  getAvailableDeckCopies,
  getAvailableSideboardCopies,
} from '../utils/matchupCardAdjust.js'

/** Parse the JSON drag payload a CardPile sets on dragstart (see CardPile.jsx); null if missing/invalid. */
function parseDragPayload(e) {
  const raw = e.dataTransfer.getData('application/x-matchupketchup-card')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Find the card object a dragged payload refers to. `zone` and `card.zone` are compared as the
 * two buckets cards live in ('sideboard' vs. everything else, treated as 'main').
 */
function findCardByNameZone(cards, name, zone) {
  return (cards || []).find(
    (c) => c?.name === name && (c.zone === 'sideboard') === (zone === 'sideboard')
  )
}

/** Build the drag payload a CardPile carries: which zone it's dragged from, the card, and its zone. */
function buildDragPayload(dragSource, card) {
  return {
    source: dragSource,
    cardName: card.name,
    zone: card.zone === 'sideboard' ? 'sideboard' : 'main',
  }
}

/**
 * One mana-value column of card piles (e.g. all main-deck 2-drops), rendered for either the
 * main deck or the sideboard. Accepts drops (onDropReturn) so a card can be dragged back here
 * from a plan zone to undo its Out/In assignment.
 */
function ManaColumn({
  columnKey,
  entries,
  imageUrls,
  onEnsureImage,
  onHover,
  onMove,
  onLeave,
  dragSource,
  onDropReturn,
  onActivateCard,
  compact = false,
}) {
  const label = manaColumnLabel(columnKey)
  const hasCards = entries.length > 0

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e) {
    e.preventDefault()
    const payload = parseDragPayload(e)
    if (!payload) return
    onDropReturn?.(payload, columnKey)
  }

  return (
    <div
      className={`matchup-mana-column${hasCards ? '' : ' matchup-mana-column--empty'}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="matchup-mana-column-label">{label}</div>
      <div className="matchup-mana-column-piles">
        {entries.map(({ card, available }) => (
          <CardPile
            key={`${card.id ?? card.name}-${card.zone}`}
            cardName={card.name}
            quantity={available}
            imageUrl={imageUrls[card.name]}
            imageLoading={imageUrls[card.name] === undefined}
            zoneLabel={`${available} in deck`}
            dragPayload={buildDragPayload(dragSource, card)}
            onActivate={() => onActivateCard?.(card)}
            onEnsureImage={onEnsureImage}
            onHover={onHover}
            onMove={onMove}
            onLeave={onLeave}
            compact={compact}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * The "Out" or "In" plan zone: shows the cards currently assigned out of the deck (or in from
 * the sideboard) for the active matchup + role, and accepts drops from a ManaColumn or the
 * other PlanZone to add/move an assignment (see MatchupCardBoard's handleDropOnOut/handleDropOnIn).
 */
function PlanZone({
  title,
  subtitle,
  tone,
  entries,
  imageUrls,
  onEnsureImage,
  onHover,
  onMove,
  onLeave,
  dragSource,
  onDrop,
  onActivateCard,
  emptyText,
}) {
  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e) {
    e.preventDefault()
    const payload = parseDragPayload(e)
    if (!payload) return
    onDrop?.(payload)
  }

  return (
    <div
      className={`matchup-plan-zone matchup-plan-zone--${tone}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="matchup-plan-zone-header">
        <h3 className="matchup-plan-zone-title">{title}</h3>
        <p className="matchup-plan-zone-subtitle">{subtitle}</p>
      </div>
      <div className="matchup-plan-zone-body">
        {entries.length === 0 ? (
          <p className="matchup-plan-zone-empty">{emptyText}</p>
        ) : (
          <div className="matchup-plan-zone-piles">
            {entries.map(({ card, assigned }) => (
              <CardPile
                key={`${card.id ?? card.name}-${card.zone}`}
                className="card-pile-zone"
                cardName={card.name}
                quantity={assigned}
                imageUrl={imageUrls[card.name]}
                imageLoading={imageUrls[card.name] === undefined}
                zoneLabel={`${assigned} ${tone}`}
                dragPayload={buildDragPayload(dragSource, card)}
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

/**
 * Card-pile matchup builder: pick an archetype + play/draw, slide cards into OUT / IN zones.
 */
export default function MatchupCardBoard({
  cards = [],
  archetypes = [],
  values = {},
  cardTypes = {},
  cardManaValues = {},
  hideLands = false,
  imageUrls = {},
  onChangeCell,
  onEnsureImage,
  onCardHover,
  onCardMove,
  onCardLeave,
}) {
  // --- State: which archetype tab and play/draw role are currently selected ---
  const safeArchetypes = useMemo(
    () =>
      (Array.isArray(archetypes) ? archetypes : []).filter(
        (a) => a && typeof a.name === 'string' && a.name.trim()
      ),
    [archetypes]
  )

  const [selectedArchName, setSelectedArchName] = useState(() => safeArchetypes[0]?.name ?? '')
  const [selectedRole, setSelectedRole] = useState('play')

  // Fall back to the first archetype if the selected one no longer exists (e.g. renamed/deleted).
  const activeArchName = safeArchetypes.some((a) => a.name === selectedArchName)
    ? selectedArchName
    : safeArchetypes[0]?.name ?? ''

  const activeRole = selectedRole === 'draw' ? 'draw' : 'play'

  // --- Derived data: split cards by zone, then bucket/sort for the board layout ---
  const mainCards = useMemo(
    () => (cards || []).filter((c) => c?.zone !== 'sideboard'),
    [cards]
  )
  const sideboardCards = useMemo(
    () => (cards || []).filter((c) => c?.zone === 'sideboard'),
    [cards]
  )

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
        hideLands,
        (card) => getAvailableDeckCopies(card, activeArchName, activeRole, values)
      ),
    [mainCards, cardTypes, cardManaValues, hideLands, activeArchName, activeRole, values]
  )

  const sideColumnMap = useMemo(
    () =>
      buildManaColumnMap(
        sideboardCards,
        cardTypes,
        cardManaValues,
        false,
        (card) => getAvailableSideboardCopies(card, activeArchName, activeRole, values)
      ),
    [sideboardCards, cardTypes, cardManaValues, activeArchName, activeRole, values]
  )

  // --- Derived data: cards already assigned Out (main deck) / In (sideboard) for the plan zones ---
  const outEntries = useMemo(() => {
    const rows = []
    for (const card of mainCards) {
      const assigned = getAssignedOutCount(card, activeArchName, activeRole, values)
      if (assigned > 0) rows.push({ card, assigned })
    }
    rows.sort((a, b) => a.card.name.localeCompare(b.card.name))
    return rows
  }, [mainCards, activeArchName, activeRole, values])

  const inEntries = useMemo(() => {
    const rows = []
    for (const card of sideboardCards) {
      const assigned = getAssignedInCount(card, activeArchName, activeRole, values)
      if (assigned > 0) rows.push({ card, assigned })
    }
    rows.sort((a, b) => a.card.name.localeCompare(b.card.name))
    return rows
  }, [sideboardCards, activeArchName, activeRole, values])

  const totalOut = outEntries.reduce((sum, row) => sum + row.assigned, 0)
  const totalIn = inEntries.reduce((sum, row) => sum + row.assigned, 0)

  // --- Drag-and-drop handlers: each plan zone / mana column is its own drop target ---

  /**
   * Drop target: the "Out" plan zone. Only accepts a main-deck card (not one already coming
   * from the Out zone itself, and not a sideboard card) and moves one copy out of the deck.
   */
  function handleDropOnOut(payload) {
    const zone = payload?.zone === 'sideboard' ? 'sideboard' : 'main'
    const card = findCardByNameZone(cards, payload?.cardName, zone)
    if (!card) return
    if (payload?.source === 'out') return
    if (zone === 'sideboard') return
    adjust(card, 1)
  }

  /**
   * Drop target: the "In" plan zone. Only accepts a sideboard card (not one already coming
   * from the In zone itself, and not a main-deck card) and moves one copy in from the sideboard.
   */
  function handleDropOnIn(payload) {
    const zone = payload?.zone === 'sideboard' ? 'sideboard' : 'main'
    const card = findCardByNameZone(cards, payload?.cardName, zone)
    if (!card) return
    if (payload?.source === 'in') return
    if (zone !== 'sideboard') return
    adjust(card, 1)
  }

  /**
   * Drop target: a deck mana column (main or sideboard). Returns a card to the deck by undoing
   * whichever assignment it came from — an Out-zone card goes back into the main deck, an
   * In-zone card goes back into the sideboard. Dropping a deck card onto its own zone
   * ('deck-main'/'deck-side') is a no-op — it never left the deck.
   */
  function handleDropReturnToDeck(payload) {
    const zone = payload?.zone === 'sideboard' ? 'sideboard' : 'main'
    const card = findCardByNameZone(cards, payload?.cardName, zone)
    if (!card) return
    if (payload?.source === 'out' && zone === 'main') {
      adjust(card, -1)
      return
    }
    if (payload?.source === 'in' && zone === 'sideboard') {
      adjust(card, -1)
      return
    }
    if (payload?.source === 'deck-main' && zone === 'main') return
    if (payload?.source === 'deck-side' && zone === 'sideboard') return
  }

  /** Clicking an Out-zone pile is a shortcut for dragging it back to the deck: removes one copy. */
  function handleActivateOutCard(card) {
    adjust(card, -1)
  }

  /** Clicking an In-zone pile is a shortcut for dragging it back to the sideboard: removes one copy. */
  function handleActivateInCard(card) {
    adjust(card, -1)
  }

  // --- Render ---

  if (safeArchetypes.length === 0) {
    return (
      <div className="matchup-card-board matchup-card-board--empty">
        <p className="matchup-card-board-empty-msg">
          No matchup columns yet. Add archetypes in your metagame to start building sideboard plans.
        </p>
      </div>
    )
  }

  const activeArch = safeArchetypes.find((a) => a.name === activeArchName)

  return (
    <div className="matchup-card-board">
      <div className="matchup-card-board-toolbar">
        <div className="matchup-card-board-toolbar-group">
          <span className="matchup-card-board-toolbar-label">Matchup</span>
          <div className="matchup-archetype-tabs" role="tablist" aria-label="Select matchup">
            {safeArchetypes.map((arch) => {
              const pct =
                arch.metagamePercent != null && arch.metagamePercent !== ''
                  ? ` (${arch.metagamePercent}%)`
                  : ''
              const selected = arch.name === activeArchName
              return (
                <button
                  key={arch.name}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`matchup-archetype-tab${selected ? ' matchup-archetype-tab--active' : ''}`}
                  onClick={() => setSelectedArchName(arch.name)}
                >
                  {arch.name}
                  {pct ? <span className="matchup-archetype-tab-pct">{pct}</span> : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="matchup-card-board-toolbar-group">
          <span className="matchup-card-board-toolbar-label">Plan</span>
          <div className="matchup-role-toggle" role="group" aria-label="On the play or draw">
            <button
              type="button"
              className={`matchup-role-btn${activeRole === 'play' ? ' matchup-role-btn--active' : ''}`}
              onClick={() => setSelectedRole('play')}
            >
              On the play
            </button>
            <button
              type="button"
              className={`matchup-role-btn${activeRole === 'draw' ? ' matchup-role-btn--active' : ''}`}
              onClick={() => setSelectedRole('draw')}
            >
              On the draw
            </button>
          </div>
        </div>

        <div className="matchup-card-board-totals" aria-live="polite">
          <span className="matchup-card-board-total matchup-card-board-total--out">
            Out: <strong>{totalOut}</strong>
          </span>
          <span className="matchup-card-board-total matchup-card-board-total--in">
            In: <strong>{totalIn}</strong>
          </span>
        </div>
      </div>

      <p className="matchup-card-board-hint">
        Drag cards from your deck into <strong>Out</strong> (main deck) or <strong>In</strong> (sideboard).
        Click a pile to move one copy. Planning for{' '}
        <strong>{activeArch?.name ?? 'this matchup'}</strong> ({activeRole === 'play' ? 'play' : 'draw'}).
      </p>

      <div className="matchup-card-board-layout">
        <section className="matchup-deck-panel" aria-label="Deck cards">
          <header className="matchup-deck-panel-header">
            <h3 className="matchup-deck-panel-title">Main deck</h3>
            <span className="matchup-deck-panel-meta">Sorted by mana value</span>
          </header>
          <div className="matchup-mana-columns">
            {MANA_COLUMN_ORDER.map((columnKey) => {
              const entries = mainColumnMap.get(columnKey) || []
              if (hideLands && columnKey === 'lands') return null
              return (
                <ManaColumn
                  key={`main-${columnKey}`}
                  columnKey={columnKey}
                  entries={entries}
                  imageUrls={imageUrls}
                  onEnsureImage={onEnsureImage}
                  onHover={onCardHover}
                  onMove={onCardMove}
                  onLeave={onCardLeave}
                  dragSource="deck-main"
                  onDropReturn={handleDropReturnToDeck}
                  onActivateCard={(card) => adjust(card, 1)}
                />
              )
            })}
          </div>

          {sideboardCards.length > 0 && (
            <>
              <header className="matchup-deck-panel-header matchup-deck-panel-header--side">
                <h3 className="matchup-deck-panel-title">Sideboard</h3>
              </header>
              <div className="matchup-mana-columns matchup-mana-columns--sideboard">
                {MANA_COLUMN_ORDER.map((columnKey) => {
                  const entries = sideColumnMap.get(columnKey) || []
                  return (
                    <ManaColumn
                      key={`side-${columnKey}`}
                      columnKey={columnKey}
                      entries={entries}
                      imageUrls={imageUrls}
                      onEnsureImage={onEnsureImage}
                      onHover={onCardHover}
                      onMove={onCardMove}
                      onLeave={onCardLeave}
                      dragSource="deck-side"
                      onDropReturn={handleDropReturnToDeck}
                      onActivateCard={(card) => adjust(card, 1)}
                      compact
                    />
                  )
                })}
              </div>
            </>
          )}
        </section>

        <section className="matchup-plan-panel" aria-label="Sideboard plan">
          <PlanZone
            title="Out"
            subtitle="Cards leaving your main deck"
            tone="out"
            entries={outEntries}
            imageUrls={imageUrls}
            onEnsureImage={onEnsureImage}
            onHover={onCardHover}
            onMove={onCardMove}
            onLeave={onCardLeave}
            dragSource="out"
            onDrop={handleDropOnOut}
            onActivateCard={handleActivateOutCard}
            emptyText="Drop main-deck cards here"
          />
          <PlanZone
            title="In"
            subtitle="Cards coming in from your sideboard"
            tone="in"
            entries={inEntries}
            imageUrls={imageUrls}
            onEnsureImage={onEnsureImage}
            onHover={onCardHover}
            onMove={onCardMove}
            onLeave={onCardLeave}
            dragSource="in"
            onDrop={handleDropOnIn}
            onActivateCard={handleActivateInCard}
            emptyText="Drop sideboard cards here"
          />
        </section>
      </div>
    </div>
  )
}
