import './SideboardGuide.css'

/**
 * Build OUTS (negative) and INS (positive) lines for one archetype from matchup values.
 * matchupValues keys are "cardName::archetypeName".
 */
function buildOutsAndIns(matchupValues, archetypeName) {
  const suffix = `::${archetypeName}`
  const outs = []
  const ins = []
  if (!matchupValues || typeof matchupValues !== 'object' || Array.isArray(matchupValues)) {
    return { outs, ins }
  }
  for (const key of Object.keys(matchupValues)) {
    if (!key.endsWith(suffix)) continue
    let cardName = key.slice(0, -suffix.length)
    // Strip any zone suffix (e.g. "::sideboard") from the display name so we
    // don't show technical key information in the UI.
    if (cardName.endsWith('::sideboard')) {
      cardName = cardName.slice(0, -'::sideboard'.length)
    }
    const raw = matchupValues[key]
    if (raw === undefined || raw === null || raw === '') continue
    const n = Number.parseInt(String(raw).trim(), 10)
    if (Number.isNaN(n)) continue
    if (n < 0) outs.push({ cardName, qty: Math.abs(n) })
    else if (n > 0) ins.push({ cardName, qty: n })
  }
  outs.sort((a, b) => a.cardName.localeCompare(b.cardName))
  ins.sort((a, b) => a.cardName.localeCompare(b.cardName))
  return { outs, ins }
}

/**
 * SideboardGuide - One block per matchup with OUTS/INS in plain English and a "Keys to the matchup" field.
 *
 * Props:
 *   archetypes - Array of { name, metagamePercent }
 *   matchupValues - Flat object keyed "cardName::archetypeName"
 *   keysToMatchup - Object keyed by archetype name -> string (free text)
 *   onKeysChange - (archetypeName, text) => void
 */
function SideboardGuide({ archetypes = [], matchupValues = {}, keysToMatchup = {}, onKeysChange }) {
  const list = Array.isArray(archetypes) ? archetypes : []

  return (
    <div className="sideboard-guide">
      {list.length === 0 ? (
        <p className="sideboard-guide-empty">Add archetypes in Metagame Input to see sideboard guides.</p>
      ) : (
        <div className="sideboard-guide-list">
          {list.map((arch) => {
            const { outs, ins } = buildOutsAndIns(matchupValues, arch.name)
            const hasChanges = outs.length > 0 || ins.length > 0
            return (
              <div key={arch.name} className="sideboard-guide-block">
                <h3 className="sideboard-guide-title">vs. {arch.name}</h3>
                <div className="sideboard-guide-changes">
                  {!hasChanges ? (
                    <p className="sideboard-guide-no-changes">No sideboard changes entered for this matchup.</p>
                  ) : (
                    <>
                      {outs.length > 0 && (
                        <>
                          <div className="sideboard-guide-label">OUTS:</div>
                          <ul className="sideboard-guide-list-outs">
                            {outs.map(({ cardName, qty }) => (
                              <li key={cardName}>- {qty} {cardName}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {ins.length > 0 && (
                        <>
                          <div className="sideboard-guide-label">INS:</div>
                          <ul className="sideboard-guide-list-ins">
                            {ins.map(({ cardName, qty }) => (
                              <li key={cardName}>+{qty} {cardName}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </>
                  )}
                </div>
                <div className="sideboard-guide-keys-wrap">
                  <label className="sideboard-guide-keys-label" htmlFor={`keys-${arch.name}`}>
                    Keys to the matchup
                  </label>
                  <textarea
                    id={`keys-${arch.name}`}
                    className="sideboard-guide-keys-input"
                    value={keysToMatchup[arch.name] ?? ''}
                    onChange={(e) => onKeysChange?.(arch.name, e.target.value)}
                    placeholder="e.g. Kill their engine early, save removal for..."
                    rows={3}
                    aria-label={`Keys to the matchup vs ${arch.name}`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SideboardGuide
