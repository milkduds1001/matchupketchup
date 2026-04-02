import { useState, useId } from 'react'
import './DeckUpload.css'

/**
 * Parses one line in the format "quantity card name".
 * Returns { quantity, name } or null if the line is invalid.
 * Blank or whitespace-only lines are ignored (return null).
 */
function parseLine(line, lineNumber) {
  const trimmed = line.trim()
  if (trimmed === '') return null

  const firstSpace = trimmed.indexOf(' ')
  if (firstSpace === -1) {
    return { error: `Line ${lineNumber}: expected "quantity card name" (e.g. "4 Lightning Bolt")` }
  }

  const quantityStr = trimmed.slice(0, firstSpace)
  const quantity = Number.parseInt(quantityStr, 10)
  if (Number.isNaN(quantity) || quantity < 1) {
    return { error: `Line ${lineNumber}: quantity must be a positive number, got "${quantityStr}"` }
  }

  const name = trimmed.slice(firstSpace + 1).trim()
  if (name === '') {
    return { error: `Line ${lineNumber}: card name is missing after quantity` }
  }

  return { quantity, name }
}

/** First line index (0-based) where trimmed line is SIDEBOARD / SIDEBOARD:, or -1. */
function findSideboardKeywordLineIndex(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/^SIDEBOARD:?$/i.test(lines[i].trim())) return i
  }
  return -1
}

/** First line index (0-based) where sideboard starts after two consecutive blank lines, or -1. */
function findDoubleBlankSideboardStart(lines) {
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim() === '' && lines[i + 1].trim() === '') return i + 2
  }
  return -1
}

/**
 * First line index (0-based) where sideboard starts after a single blank line between two card blocks, or -1.
 * Skips runs of multiple blanks (handled by findDoubleBlankSideboardStart first).
 */
function findSingleBlankSideboardStart(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') continue
    if (i === 0) continue
    if (lines[i - 1].trim() === '') continue
    if (i + 1 >= lines.length) continue
    if (lines[i + 1].trim() === '') continue
    return i + 1
  }
  return -1
}

function pushCardFromLine(cards, line, lineNumber, zone) {
  const trimmed = line.trim()
  if (trimmed === '') return
  if (/^SIDEBOARD:?$/i.test(trimmed)) return

  const result = parseLine(line, lineNumber)
  if (result === null) return
  if (result.error) return { error: result.error }

  cards.push({
    id: `line-${lineNumber}`,
    name: result.name,
    quantity: result.quantity,
    zone,
  })
  return null
}

/**
 * Parses full deck text. Sideboard zone is determined by (first match):
 * 1. A line that is only SIDEBOARD or SIDEBOARD: (case-insensitive)
 * 2. A form feed (\\f / page break): everything after the first \\f is sideboard
 * 3. Two consecutive blank lines: everything after that gap is sideboard
 * 4. One blank line between non-empty lines (if 3 did not apply): cards below that gap are sideboard
 */
function parseDeckFileText(text) {
  const cards = []
  const errors = []

  const lines = text.split(/\r?\n/)
  const keywordIdx = findSideboardKeywordLineIndex(lines)

  if (keywordIdx !== -1) {
    lines.forEach((line, index) => {
      if (index === keywordIdx) return
      const lineNumber = index + 1
      const zone = index > keywordIdx ? 'sideboard' : 'main'
      const err = pushCardFromLine(cards, line, lineNumber, zone)
      if (err) errors.push(err.error)
    })
    return { cards, errors }
  }

  const ff = text.indexOf('\f')
  if (ff !== -1) {
    const mainLines = text.slice(0, ff).split(/\r?\n/)
    const sideLines = text.slice(ff + 1).split(/\r?\n/)
    const mainCount = mainLines.length
    mainLines.forEach((line, index) => {
      const lineNumber = index + 1
      const err = pushCardFromLine(cards, line, lineNumber, 'main')
      if (err) errors.push(err.error)
    })
    sideLines.forEach((line, index) => {
      const lineNumber = mainCount + index + 1
      const err = pushCardFromLine(cards, line, lineNumber, 'sideboard')
      if (err) errors.push(err.error)
    })
    return { cards, errors }
  }

  let blankSplit = findDoubleBlankSideboardStart(lines)
  if (blankSplit === -1) blankSplit = findSingleBlankSideboardStart(lines)
  if (blankSplit !== -1) {
    lines.forEach((line, index) => {
      const lineNumber = index + 1
      const zone = index >= blankSplit ? 'sideboard' : 'main'
      const err = pushCardFromLine(cards, line, lineNumber, zone)
      if (err) errors.push(err.error)
    })
    return { cards, errors }
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const err = pushCardFromLine(cards, line, lineNumber, 'main')
    if (err) errors.push(err.error)
  })
  return { cards, errors }
}

/**
 * DeckUpload - Lets the user upload a .txt deck list and parses it.
 *
 * How file upload works in the browser:
 * 1. We use an <input type="file"> so the user can pick a file from their device.
 * 2. When they select a file, the "change" event fires with the chosen file(s).
 * 3. We use the FileReader API to read the file as text (readAsText).
 * 4. readAsText is async; when it finishes, we get the text in the "load" callback.
 * 5. We parse the text and pass the result up to the parent via the onCardsParsed prop.
 *
 * Sideboard is detected by (in order): a SIDEBOARD / SIDEBOARD: line; a form feed (page break);
 * two blank lines in a row; or a single blank line between main and side sections.
 *
 * Props:
 *   onCardsParsed - Function(cards). Called with array of { id, name, quantity, zone } when parsing succeeds.
 */
function DeckUpload({ onCardsParsed }) {
  const [parseErrors, setParseErrors] = useState([])
  const [chosenFileName, setChosenFileName] = useState('')
  const fileInputId = useId()

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setChosenFileName(file.name)
    setParseErrors([])

    const reader = new FileReader()

    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== 'string') {
        setParseErrors(['Could not read file as text.'])
        return
      }

      const { cards, errors } = parseDeckFileText(text)

      if (errors.length > 0) {
        setParseErrors(errors)
      }
      if (cards.length > 0) {
        onCardsParsed?.(cards)
      }
    }

    reader.onerror = () => {
      setParseErrors(['Failed to read the file. Please try again.'])
    }

    reader.readAsText(file)

    // Reset the input so the same file can be selected again
    event.target.value = ''
  }

  return (
    <div className="deck-upload">
      <div className="deck-upload-picker">
        <input
          id={fileInputId}
          type="file"
          accept=".txt"
          onChange={handleFileChange}
          className="deck-upload-input-native"
          aria-label="Choose a deck list .txt file"
        />
        <label htmlFor={fileInputId} className="deck-upload-choose-label">
          Choose file…
        </label>
        <span className="deck-upload-filename" aria-live="polite">
          {chosenFileName || 'No file chosen'}
        </span>
      </div>
      <p className="deck-upload-hint">
        Upload a .txt file with one line per card: <code>quantity card name</code> (e.g. <code>4 Lightning Bolt</code>).
        Sideboard: use a <code>SIDEBOARD</code> line, a page break in the file, or a blank line (or two) between main and side.
      </p>
      {parseErrors.length > 0 && (
        <div className="deck-upload-errors" role="alert">
          <strong>Could not parse some lines:</strong>
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

export default DeckUpload
