import { useState } from 'react'
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
 * If the file contains a line with just "SIDEBOARD" or "SIDEBOARD:" (common MTG format),
 * every card listed BELOW that line is tagged with zone: "sideboard".
 * Cards before that line are tagged with zone: "main".
 *
 * Props:
 *   onCardsParsed - Function(cards). Called with array of { id, name, quantity, zone } when parsing succeeds.
 */
function DeckUpload({ onCardsParsed }) {
  const [parseErrors, setParseErrors] = useState([])

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setParseErrors([])

    const reader = new FileReader()

    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== 'string') {
        setParseErrors(['Could not read file as text.'])
        return
      }

      const lines = text.split(/\r?\n/)
      const cards = []
      const errors = []
      let inSideboard = false

      lines.forEach((line, index) => {
        const lineNumber = index + 1
        const trimmed = line.trim()

        // Detect SIDEBOARD marker (case-insensitive, with optional trailing colon) and
        // switch zone for following cards.
        if (/^SIDEBOARD:?$/i.test(trimmed)) {
          inSideboard = true
          return
        }

        const result = parseLine(line, lineNumber)

        if (result === null) return // blank line, skip

        if (result.error) {
          errors.push(result.error)
          return
        }

        cards.push({
          id: `line-${lineNumber}`,
          name: result.name,
          quantity: result.quantity,
          zone: inSideboard ? 'sideboard' : 'main',
        })
      })

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
      <input
        type="file"
        accept=".txt"
        onChange={handleFileChange}
        className="deck-upload-input"
        aria-label="Choose a deck list .txt file"
      />
      <p className="deck-upload-hint">
        Upload a .txt file with one line per card: <code>quantity card name</code> (e.g. <code>4 Lightning Bolt</code>).
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
