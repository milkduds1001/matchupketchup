import { useState, useMemo } from 'react'
import './MetagameInput.css'

/**
 * Parses one line in the format "Archetype Name,Percent".
 * Returns { name, metaPercent } or { error }.
 * Blank lines return null (ignored).
 */
function parseLine(line, lineNumber) {
  const trimmed = line.trim()
  if (trimmed === '') return null

  const lastComma = trimmed.lastIndexOf(',')
  if (lastComma === -1) {
    return { error: `Line ${lineNumber}: expected "Archetype Name,Percent" (e.g. "Mono-Red,15")` }
  }

  const name = trimmed.slice(0, lastComma).trim()
  const percentStr = trimmed.slice(lastComma + 1).trim()

  if (name === '') {
    return { error: `Line ${lineNumber}: archetype name is missing` }
  }

  const percent = Number.parseFloat(percentStr)
  if (Number.isNaN(percent) || percent < 0 || percent > 100) {
    return { error: `Line ${lineNumber}: percent must be a number between 0 and 100, got "${percentStr}"` }
  }

  return { name, metaPercent: percent }
}

/** Sample Standard metagame for the "Load sample" button */
const SAMPLE_STANDARD_METAGAME = [
  { id: 'mono-red', name: 'Mono-Red', metaPercent: 15 },
  { id: 'control', name: 'Control', metaPercent: 12 },
  { id: 'aggro', name: 'Aggro', metaPercent: 10 },
  { id: 'midrange', name: 'Midrange', metaPercent: 18 },
  { id: 'combo', name: 'Combo', metaPercent: 8 },
]

/**
 * MetagameInput - Structured table for up to 10 archetypes (Deck name + Metagame share).
 * The data that flows out is the same as before: [{ id, name, metaPercent }].
 *
 * Props:
 *   archetypes - Optional array of { id, name, metagamePercent } to prefill rows (e.g. when loading a saved metagame).
 *   onArchetypesChange - Function(archetypes). Called with [{ id, name, metaPercent }] when parsing from text or when loading sample.
 */
function fillRowsFromArchetypes(archetypes) {
  if (!Array.isArray(archetypes) || archetypes.length === 0) {
    return Array.from({ length: 10 }, () => ({ name: '', share: '' }))
  }
  return Array.from({ length: 10 }, (_, i) => {
    const a = archetypes[i]
    return a ? { name: a.name ?? '', share: String(a.metagamePercent ?? '') } : { name: '', share: '' }
  })
}

function MetagameInput({ archetypes = [], onArchetypesChange }) {
  const [rows, setRows] = useState(() => fillRowsFromArchetypes(archetypes))
  const [parseErrors, setParseErrors] = useState([])

  function handleChangeRow(index, field, value) {
    setRows((prev) => {
      const next = prev.slice()
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const { otherPercent, sumPercent } = useMemo(() => {
    let sum = 0
    rows.forEach((row) => {
      const shareStr = String(row.share ?? '').trim()
      if (shareStr === '') return
      const n = Number.parseFloat(shareStr)
      if (!Number.isNaN(n) && n >= 0 && n <= 100) {
        sum += n
      }
    })
    return { sumPercent: sum, otherPercent: 100 - sum }
  }, [rows])

  function handleParse() {
    const archetypes = []
    const errors = []

    rows.forEach((row, index) => {
      const lineNumber = index + 1
      const name = String(row.name ?? '').trim()
      const share = String(row.share ?? '').trim()

      // Skip completely empty rows
      if (name === '' && share === '') return

      const syntheticLine = `${name},${share}`
      const result = parseLine(syntheticLine, lineNumber)

      if (result === null) return

      if (result.error) {
        errors.push(result.error)
        return
      }

      archetypes.push({
        id: `line-${lineNumber}`,
        name: result.name,
        metaPercent: result.metaPercent,
      })
    })

    if (sumPercent > 100.0001) {
      errors.push(
        `Total metagame share across rows exceeds 100% (currently ${sumPercent.toFixed(1)}%).`
      )
    }

    setParseErrors(errors)
    if (archetypes.length > 0) {
      onArchetypesChange?.(archetypes)
    }
  }

  function handleLoadSample() {
    setParseErrors([])
    const filled = SAMPLE_STANDARD_METAGAME.slice(0, 10)
    setRows((prev) => {
      const next = Array.from({ length: 10 }, (_, i) => {
        const sample = filled[i]
        if (!sample) return { name: '', share: '' }
        return { name: sample.name, share: String(sample.metaPercent) }
      })
      return next
    })
    onArchetypesChange?.(SAMPLE_STANDARD_METAGAME)
  }

  return (
    <div className="metagame-input">
      <table className="metagame-input-table" aria-label="Metagame table: up to 10 decks plus Other">
        <thead>
          <tr>
            <th className="metagame-col-index">#</th>
            <th className="metagame-col-name">Deck name</th>
            <th className="metagame-col-share">% of metagame</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              <td className="metagame-cell-index">{idx + 1}</td>
              <td>
                <input
                  type="text"
                  className="metagame-input-name"
                  value={row.name}
                  onChange={(e) => handleChangeRow(idx, 'name', e.target.value)}
                  placeholder="e.g. Izzet Lessons"
                  aria-label={`Deck name for row ${idx + 1}`}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="metagame-input-share"
                  value={row.share}
                  onChange={(e) => handleChangeRow(idx, 'share', e.target.value)}
                  placeholder="0"
                  aria-label={`Metagame share for row ${idx + 1}`}
                />
              </td>
            </tr>
          ))}
          <tr className="metagame-row-other">
            <td className="metagame-cell-index metagame-cell-other-label" colSpan={2}>
              Other
            </td>
            <td className="metagame-cell-other-share">
              {Number.isFinite(otherPercent) ? `${otherPercent.toFixed(1)}%` : '—'}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="metagame-input-actions">
        <button type="button" className="metagame-input-btn" onClick={handleParse}>
          Parse and apply
        </button>
        <button type="button" className="metagame-input-btn metagame-input-btn-secondary metagame-input-btn-load-sample-hidden" onClick={handleLoadSample}>
          Load sample Standard metagame
        </button>
      </div>
      <p className="metagame-input-hint">
        One line per archetype: <code>Archetype Name,Percent</code> (e.g. <code>Mono-Red,15</code>). Blank lines are ignored.
      </p>
      {parseErrors.length > 0 && (
        <div className="metagame-input-errors" role="alert">
          <strong>Validation errors:</strong>
          <ul>
            {parseErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default MetagameInput
