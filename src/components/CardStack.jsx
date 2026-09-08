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
  onHover,
  onMove,
  onLeave,
  compact = false,
}) {
  const name = String(cardName || '').trim()
  const count = Math.min(MAX_RENDERED_COPIES, Math.max(0, Math.floor(Number(quantity) || 0)))
  if (!name || count <= 0) return null

  return (
    <div className={`card-row-stack${compact ? ' card-row-stack--compact' : ''}`}>
      {Array.from({ length: count }, (_, i) => {
        const selected = Boolean(isSelected?.(i))
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
            aria-label={`${name}, copy ${i + 1} of ${count}`}
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
            onMouseEnter={(e) => {
              onEnsureImage?.(name)
              onHover?.(name, e)
            }}
            onMouseMove={(e) => onMove?.(e)}
            onFocus={(e) => {
              onEnsureImage?.(name)
              const r = e.currentTarget.getBoundingClientRect()
              onHover?.(name, { clientX: r.right + 8, clientY: r.top + 4 })
            }}
            onMouseLeave={() => onLeave?.()}
            onBlur={() => onLeave?.()}
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
          </div>
        )
      })}
    </div>
  )
}
