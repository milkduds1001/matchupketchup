/**
 * CardStack.jsx — renders every available copy of one card as its own large, full-art,
 * individually selectable/draggable row. Copies overlap like a card catalog (Moxfield-style):
 * each copy but the last is pulled up under the one below it so only its top "peek" strip
 * (name + mana cost) shows, while the last/bottom copy renders in full. Instead of one tile plus
 * a numeric "x4" badge (see the older CardPile.jsx, used by MatchupCardBoard.jsx).
 *
 * All tiles for a card are fungible — the data model tracks only a quantity, not per-copy
 * identity — but selection is still tracked per rendered row (`isSelected(tileIndex)`), so each
 * shift/ctrl-click (or the row's checkbox) toggles exactly the one row clicked, independent of
 * any others already selected. Plain click keeps the original quick-move behavior (`onActivate`).
 * Dragging delegates payload construction to the parent via `buildTileDragPayload`, since only
 * the parent (PlanBuilderPage.jsx) knows about any active multi-card selection spanning other
 * stacks in the same panel.
 */
import './CardStack.css'

// A real decklist copy count never approaches this; just guards against pathological data.
const MAX_RENDERED_COPIES = 40

// Cap how many copies actually cascade — a non-basic card can't exceed 4 anyway, but basic lands
// routinely run 10-20+, and cascading every single one would make that one card's stack taller
// than the rest of the row/column combined. Past the cap, the bottom (fully visible) card just
// carries a "×N" badge with the true count instead of growing the pile further.
const CASCADE_VISUAL_CAP = 5

export default function CardStack({
  cardName,
  quantity,
  imageUrl,
  imageLoading = false,
  isSelected,
  onToggleTile,
  onActivate,
  buildTileDragPayload,
  onEnsureImage,
  compact = false,
}) {
  const name = String(cardName || '').trim()
  const trueCount = Math.min(MAX_RENDERED_COPIES, Math.max(0, Math.floor(Number(quantity) || 0)))
  if (!name || trueCount <= 0) return null
  const count = Math.min(trueCount, CASCADE_VISUAL_CAP)

  return (
    <div className={`card-row-stack${compact ? ' card-row-stack--compact' : ''}`}>
      {Array.from({ length: count }, (_, i) => {
        const selected = Boolean(isSelected?.(i))
        const isLast = i === count - 1
        return (
          <div
            key={i}
            data-card-name={name}
            data-tile-index={i}
            className={`card-row${selected ? ' card-row--selected' : ''}`}
            draggable
            tabIndex={0}
            role="button"
            aria-pressed={selected}
            aria-label={`${name}, copy ${i + 1} of ${trueCount}`}
            title={name}
            onDragStart={(e) => {
              const payload = buildTileDragPayload?.(i)
              if (!payload) {
                e.preventDefault()
                return
              }
              e.dataTransfer.setData('application/x-matchupketchup-card', JSON.stringify(payload))
              e.dataTransfer.effectAllowed = 'move'
              e.currentTarget.classList.add('card-row--dragging')
            }}
            onDragEnd={(e) => e.currentTarget.classList.remove('card-row--dragging')}
            onClick={(e) => {
              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                onToggleTile?.(i)
                return
              }
              onActivate?.()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (e.shiftKey || e.ctrlKey || e.metaKey) onToggleTile?.(i)
                else onActivate?.()
              }
            }}
            onMouseEnter={() => onEnsureImage?.(name)}
            onFocus={() => onEnsureImage?.(name)}
          >
            <button
              type="button"
              className="card-row-check"
              aria-label={selected ? `Deselect ${name}` : `Select ${name}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleTile?.(i)
              }}
            >
              {selected ? '✓' : ''}
            </button>
            {imageUrl ? (
              <img src={imageUrl} alt={name} className="card-row-art" draggable={false} />
            ) : (
              <span className="card-row-art card-row-art--fallback">
                {imageLoading ? '…' : name}
              </span>
            )}
            {isLast && trueCount > count && <span className="card-row-qty">×{trueCount}</span>}
          </div>
        )
      })}
    </div>
  )
}
