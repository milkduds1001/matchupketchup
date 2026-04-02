import './SideboardGuide.css'
import { buildOutsAndInsForArchetypeRole } from '../utils/matchupKeys.js'

/** Base ~0.9rem (slightly larger than old table default); shrinks as entry count grows. */
const PLAYDRAW_FONT_BASE_REM = 0.9
const PLAYDRAW_FONT_MIN_REM = 0.52
const PLAYDRAW_FONT_PER_ENTRY = 0.034

function playdrawFontRemForEntryCount(entryCount) {
  if (entryCount <= 0) return PLAYDRAW_FONT_BASE_REM
  return Math.max(
    PLAYDRAW_FONT_MIN_REM,
    PLAYDRAW_FONT_BASE_REM - entryCount * PLAYDRAW_FONT_PER_ENTRY
  )
}

function OutsInsBlock({ outs, ins, hideLabels = false }) {
  const entryCount = outs.length + ins.length
  const fontRem = playdrawFontRemForEntryCount(entryCount)
  const has = entryCount > 0
  if (!has) {
    return (
      <div
        className="sideboard-guide-playdraw-cell-inner sideboard-guide-playdraw-cell-inner--empty"
        style={{ fontSize: `${PLAYDRAW_FONT_BASE_REM}rem` }}
      >
        <p className="sideboard-guide-cell-empty">No changes</p>
      </div>
    )
  }
  return (
    <div className="sideboard-guide-playdraw-cell-inner" style={{ fontSize: `${fontRem}rem` }}>
      {outs.length > 0 && (
        <>
          {!hideLabels && <div className="sideboard-guide-label">OUTS:</div>}
          <ul className="sideboard-guide-list-outs">
            {outs.map(({ cardName, qty }) => (
              <li key={cardName}>- {qty} {cardName}</li>
            ))}
          </ul>
        </>
      )}
      {ins.length > 0 && (
        <>
          {!hideLabels && <div className="sideboard-guide-label">INS:</div>}
          <ul className="sideboard-guide-list-ins">
            {ins.map(({ cardName, qty }) => (
              <li key={cardName}>+{qty} {cardName}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/**
 * SideboardGuide - One block per matchup with OUTS/INS (play / draw) and a "Keys to the matchup" field.
 */
function SideboardGuide({
  archetypes = [],
  matchupValues = {},
  keysToMatchup = {},
  onKeysChange,
}) {
  const list = Array.isArray(archetypes) ? archetypes : []

  return (
    <div className="sideboard-guide">
      {list.length === 0 ? (
        <p className="sideboard-guide-empty">Add archetypes in Metagame Input to see sideboard guides.</p>
      ) : (
        <div className="sideboard-guide-list">
          {list.map((arch) => {
            const onPlay = buildOutsAndInsForArchetypeRole(matchupValues, arch.name, 'play')
            const onDraw = buildOutsAndInsForArchetypeRole(matchupValues, arch.name, 'draw')
            return (
              <div key={arch.name} className="sideboard-guide-block">
                <h3 className="sideboard-guide-title">vs. {arch.name}</h3>
                <div className="sideboard-guide-keys-wrap">
                  <div className="sideboard-guide-playdraw-col">
                    <table className="sideboard-guide-playdraw-table">
                      <thead>
                        <tr>
                          <th className="sideboard-guide-playdraw-corner" scope="col" />
                          <th scope="col">On the play</th>
                          <th scope="col">On the draw</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th scope="row">OUTS</th>
                          <td>
                            <OutsInsBlock outs={onPlay.outs} ins={[]} hideLabels />
                          </td>
                          <td>
                            <OutsInsBlock outs={onDraw.outs} ins={[]} hideLabels />
                          </td>
                        </tr>
                        <tr>
                          <th scope="row">INS</th>
                          <td>
                            <OutsInsBlock outs={[]} ins={onPlay.ins} hideLabels />
                          </td>
                          <td>
                            <OutsInsBlock outs={[]} ins={onDraw.ins} hideLabels />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="sideboard-guide-keys-col">
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SideboardGuide
