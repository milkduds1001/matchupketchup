/**
 * cardDragPayload.js — shared HTML5 drag-and-drop payload helpers for the card-stack sideboard
 * plan builder (PlanBuilderPage.jsx / CardStack.jsx). A payload records which panel a card tile
 * was dragged from (`source`) and which physical zone the card itself lives in (`zone`: main
 * deck vs. sideboard) — enough for a drop target to decide whether to accept it and which
 * adjustment to make (see matchupCardAdjust.js).
 *
 * Kept separate from the existing MatchupCardBoard.jsx / CardPile.jsx (which define their own,
 * near-identical local copies of this logic) so this new page doesn't need to touch that file.
 */

const DRAG_MIME_TYPE = 'application/x-matchupketchup-card'

/** Build the payload a draggable card tile carries: which panel it's dragged from, plus the card's own name + zone. */
export function buildDragPayload(source, card) {
  return {
    source,
    cardName: card?.name,
    zone: card?.zone === 'sideboard' ? 'sideboard' : 'main',
  }
}

/** Attach a drag payload to a native HTML5 drag event. */
export function setDragPayload(e, payload) {
  e.dataTransfer.setData(DRAG_MIME_TYPE, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'move'
}

/** Parse the JSON drag payload set by setDragPayload; null if missing/invalid (e.g. a drag from outside the app). */
export function parseDragPayload(e) {
  const raw = e.dataTransfer.getData(DRAG_MIME_TYPE)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Find the card object a dragged payload refers to. `zone` and `card.zone` are compared as the two buckets cards live in ('sideboard' vs. everything else, treated as 'main'). */
export function findCardByNameZone(cards, name, zone) {
  return (cards || []).find(
    (c) => c?.name === name && (c.zone === 'sideboard') === (zone === 'sideboard')
  )
}
