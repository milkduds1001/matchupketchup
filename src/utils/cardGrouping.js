export const CARD_GROUP_CREATURES_PLANESWALKERS = 'Creatures & Planeswalkers'
export const CARD_GROUP_OTHER_SPELLS = 'Other Spells'
export const CARD_GROUP_LANDS = 'Lands'

export const GROUP_SORT_ORDER = [
  CARD_GROUP_CREATURES_PLANESWALKERS,
  CARD_GROUP_OTHER_SPELLS,
  CARD_GROUP_LANDS,
]

export const GROUP_ORDER_MAP = Object.fromEntries(GROUP_SORT_ORDER.map((g, i) => [g, i]))

/**
 * Assign a card to one display/export group from type_line.
 */
export function getCardGroup(typeLine) {
  if (!typeLine || typeof typeLine !== 'string') return CARD_GROUP_OTHER_SPELLS
  const lower = typeLine.toLowerCase()
  if (lower.includes('land')) return CARD_GROUP_LANDS
  if (lower.includes('creature') || lower.includes('planeswalker')) return CARD_GROUP_CREATURES_PLANESWALKERS
  return CARD_GROUP_OTHER_SPELLS
}
