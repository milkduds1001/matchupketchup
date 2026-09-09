/**
 * CardPile.jsx — renders one MTG card as a stacked pile of layered images with a quantity badge.
 * Used by MatchupCardBoard.jsx for every card shown in the deck/sideboard mana columns
 * (see manaColumns.js) and in the Out/In plan zones. Handles drag-and-drop (a JSON payload set on
 * the native HTML5 dataTransfer, read by MatchupCardBoard's drop handlers), click-to-activate, and
 * hover/focus callbacks that drive App.jsx's floating card-preview tooltip.
 */
import './CardPile.css'

const STACK_LAYERS = 4

/** Number of visible stacked layers to render for a given copy count (capped at STACK_LAYERS). */
function stackLayerCount(quantity) {
  const q = Math.max(1, Number(quantity) || 1)
  return Math.min(q, STACK_LAYERS)
}

/**
 * Visual MTG card pile — stacked layers for multiples, quantity badge, drag + click.
 */
export default function CardPile({
  cardName,
  quantity = 1,
  imageUrl,
  imageLoading = false,
  zoneLabel = '',
  draggable = true,
  dragPayload,
  onActivate,
  onEnsureImage,
  onHover,
  onMove,
  onLeave,
  compact = false,
  muted = false,
  className = '',
}) {
  const name = String(cardName || '').trim()
  const qty = Math.max(1, Number(quantity) || 1)
  const layers = stackLayerCount(qty)
  const rootClass = [
    'card-pile',
    compact ? 'card-pile--compact' : '',
    muted ? 'card-pile--muted' : '',
    draggable ? 'card-pile--draggable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  function handleDragStart(e) {
    if (!draggable || !dragPayload) return
    e.dataTransfer.setData('application/x-matchupketchup-card', JSON.stringify(dragPayload))
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('card-pile--dragging')
  }

  function handleDragEnd(e) {
    e.currentTarget.classList.remove('card-pile--dragging')
  }

  return (
    <button
      type="button"
      className={rootClass}
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
      aria-label={`${name}${zoneLabel ? `, ${zoneLabel}` : ''}, ${qty} ${qty === 1 ? 'copy' : 'copies'}`}
      title={name}
    >
      <span className="card-pile-stack" aria-hidden="true">
        {Array.from({ length: layers }, (_, i) => {
          const layerIndex = layers - 1 - i
          return (
            <span
              key={layerIndex}
              className="card-pile-layer"
              style={{ '--pile-layer-index': layerIndex }}
            >
              {imageUrl ? (
                <img src={imageUrl} alt="" className="card-pile-image" draggable={false} />
              ) : (
                <span className="card-pile-fallback">
                  {imageLoading ? '…' : name.slice(0, 1)}
                </span>
              )}
            </span>
          )
        })}
      </span>
      {qty > 1 && <span className="card-pile-qty">{qty}</span>}
      <span className="card-pile-name">{name}</span>
    </button>
  )
}
