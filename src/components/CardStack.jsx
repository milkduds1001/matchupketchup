/**
 * CardStack.jsx — renders every available copy of one card as its own large, full-art,
 * individually draggable row. Copies overlap like a card catalog (Moxfield-style): each copy but
 * the last is pulled up under the one below it so only its top "peek" strip (name + mana cost)
 * shows, while the last/bottom copy renders in full. Instead of one tile plus a numeric "x4" badge
 * (see the older CardPile.jsx, used by MatchupCardBoard.jsx).
 *
 * One card, one action: click any row to move one copy (`onActivate`), or drag it to its
 * destination — `dragPayload` is a plain object built once by the parent, since it never depends
 * on which physical copy was grabbed (tiles for a card are fungible; the data model tracks only a
 * quantity, not per-copy identity). There used to be a shift/ctrl-click multi-select and a
 * rubber-band drag-select spanning a whole panel, each row with its own toggle checkbox — that's
 * been removed in favor of this simpler one-at-a-time interaction (still in git history if it's
 * ever wanted back).
 */
import { useState } from 'react'
import './CardStack.css'
import { namedCardImageUrl } from '../utils/scryfall.js'

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
  onActivate,
  dragPayload,
  onEnsureImage,
  size = 'default', // 'compact' | 'default' | 'large'
}) {
  const name = String(cardName || '').trim()
  const [artFailed, setArtFailed] = useState(false)
  const [namedFallback, setNamedFallback] = useState(false)
  const trueCount = Math.min(MAX_RENDERED_COPIES, Math.max(0, Math.floor(Number(quantity) || 0)))
  if (!name || trueCount <= 0) return null
  const count = Math.min(trueCount, CASCADE_VISUAL_CAP)
  const sizeClass = size === 'default' ? '' : ` card-row-stack--${size}`
  const artSrc = artFailed
    ? null
    : namedFallback
      ? namedCardImageUrl(name)
      : imageUrl || null

  return (
    <div className={`card-row-stack${sizeClass}`}>
      {Array.from({ length: count }, (_, i) => {
        const isLast = i === count - 1
        return (
          <div
            key={i}
            data-card-name={name}
            data-tile-index={i}
            className="card-row"
            draggable
            tabIndex={0}
            role="button"
            aria-label={`${name}, copy ${i + 1} of ${trueCount}`}
            title={name}
            onDragStart={(e) => {
              if (!dragPayload) {
                e.preventDefault()
                return
              }
              e.dataTransfer.setData('application/x-matchupketchup-card', JSON.stringify(dragPayload))
              e.dataTransfer.effectAllowed = 'move'
              e.currentTarget.classList.add('card-row--dragging')
            }}
            onDragEnd={(e) => e.currentTarget.classList.remove('card-row--dragging')}
            onClick={() => onActivate?.()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onActivate?.()
              }
            }}
            onMouseEnter={() => onEnsureImage?.(name)}
            onFocus={() => onEnsureImage?.(name)}
          >
            {artSrc ? (
              <img
                src={artSrc}
                alt={name}
                className="card-row-art"
                draggable={false}
                onError={() => {
                  if (!namedFallback && name) setNamedFallback(true)
                  else setArtFailed(true)
                }}
              />
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
