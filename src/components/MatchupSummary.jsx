import './MatchupSummary.css'

/**
 * Get the numeric value for one cell from matchupValues, or 0 if missing/invalid.
 * Keys are "cardName::archetypeName".
 */
function getCellValue(matchupValues, cardName, archetypeName) {
  const key = `${cardName}::${archetypeName}`
  const raw = matchupValues[key]
  if (raw === undefined || raw === '') return 0
  const num = Number.parseInt(String(raw), 10)
  return Number.isNaN(num) ? 0 : num
}

/**
 * Weighted score for one card:
 *
 * For each archetype we have:
 *   - the cell value (how many to board in, or your rating, etc.)
 *   - the metagame percent (how often you face that archetype, 0–100)
 *
 * We treat metagame percent as a weight. So we add:
 *   (cell value × metagame percent / 100)
 * for every archetype. That way archetypes you face more often count more.
 *
 * Example: Mono-Red 15%, Control 12%, Aggro 10%. Card has values 4, 2, 4.
 *   Weighted = 4×(15/100) + 2×(12/100) + 4×(10/100) = 0.6 + 0.24 + 0.4 = 1.24
 */
function getWeightedScore(card, archetypes, matchupValues) {
  let total = 0
  for (const arch of archetypes) {
    const value = getCellValue(matchupValues, card.name, arch.name)
    const weight = arch.metagamePercent / 100
    total += value * weight
  }
  return total
}

/**
 * Build list of { card, weightedScore } and sort by score descending (best first).
 */
function getCardsWithScores(cards, archetypes, matchupValues) {
  const withScores = cards.map((card) => ({
    card,
    weightedScore: getWeightedScore(card, archetypes, matchupValues),
  }))
  withScores.sort((a, b) => b.weightedScore - a.weightedScore)
  return withScores
}

/**
 * MatchupSummary - Shows a table of cards with weighted scores and best/worst 3.
 *
 * Props: cards, archetypes, matchupValues (same as MatchupTable).
 */
function MatchupSummary({ cards, archetypes, matchupValues = {} }) {
  if (cards.length === 0) {
    return (
      <p className="matchup-summary-empty">Upload a deck and fill in matchup values to see the summary.</p>
    )
  }

  const withScores = getCardsWithScores(cards, archetypes, matchupValues)
  const best3 = withScores.slice(0, 3)
  const worst3 = withScores.slice(-3).reverse()

  return (
    <div className="matchup-summary">
      <table className="matchup-summary-table">
        <thead>
          <tr>
            <th>Card</th>
            <th>Qty</th>
            <th>Weighted score</th>
          </tr>
        </thead>
        <tbody>
          {withScores.map(({ card, weightedScore }) => (
            <tr key={card.id ?? card.name}>
              <td className="matchup-summary-card-name">{card.name}</td>
              <td>{card.quantity}</td>
              <td>{weightedScore.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="matchup-summary-extremes">
        <div className="matchup-summary-block">
          <h3>Best 3 (by weighted score)</h3>
          <ol>
            {best3.map(({ card, weightedScore }) => (
              <li key={card.id ?? card.name}>
                {card.name} — {weightedScore.toFixed(2)}
              </li>
            ))}
          </ol>
        </div>
        <div className="matchup-summary-block">
          <h3>Worst 3 (by weighted score)</h3>
          <ol>
            {worst3.map(({ card, weightedScore }) => (
              <li key={card.id ?? card.name}>
                {card.name} — {weightedScore.toFixed(2)}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

export default MatchupSummary
