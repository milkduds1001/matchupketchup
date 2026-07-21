/**
 * CardStack.jsx — renders every available copy of one card as its own draggable tile, fanned
 * into a physical-looking stack, instead of one tile plus a numeric "x4" badge (see CardPile.jsx
 * for that older style, used by MatchupCardBoard.jsx). All tiles for a card are fungible — the
 * data model tracks only a quantity, not per-copy identity — so every tile shares the same drag
 * payload and click handler; interacting with any one of them adjusts the count by exactly one
 * copy. Used by PlanBuilderPage.jsx.
 */
import './CardStack.css'

// A real decklist copy count never approaches this; just guards against pathological data.
const MAX_RENDERED_COPIES = 40

export default function CardStack({
  cardName,
  quantity,
  imageUrl,
  imageLoading = false,
  draggable = true,
  dragPayload,
  onActivate,
  onEnsureImage,
  onHover,
  onMove,
  onLeave,
  compact = false,
}) {
  const name = String(cardName || '').trim()
  const count = Math.min(MAX_RENDERED_COPIES, Math.max(0, Math.floor(Number(quantity) || 0)))
  if (!name || count <= 0) return null

  function handleDragStart(e) {
    if (!draggable || !dragPayload) return
    e.dataTransfer.setData('application/x-matchupketchup-card', JSON.stringify(dragPayload))
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('card-stack-tile--dragging')
  }

  function handleDragEnd(e) {
    e.currentTarget.classList.remove('card-stack-tile--dragging')
  }

  return (
    <div className={`card-stack-entry${compact ? ' card-stack-entry--compact' : ''}`}>
      <div className="card-stack" style={{ '--copy-count': count }}>
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            className="card-stack-tile"
            style={{ '--copy-index': i }}
            draggable={draggable && Boolean(dragPayload)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={() => onActivate?.()}
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
            aria-label={`${name}, copy ${i + 1} of ${count}`}
            title={name}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" className="card-stack-image" draggable={false} />
            ) : (
              <span className="card-stack-fallback">{imageLoading ? '…' : name.slice(0, 1)}</span>
            )}
          </button>
        ))}
      </div>
      <div className="card-stack-name">{name}</div>
    </div>
  )
}
