import { useState, useEffect, useCallback } from 'react'
import {
  ensureMetagameGrid,
  saveMetagameGrid,
  applyLockedGoldfishDefaults,
  getLockedMetagameColumnIds,
  isLockedMetagameRow,
} from '../utils/storage.js'
import { fetchMetagameDefaults, getDefaultsForFormat } from '../utils/metagameDefaults.js'
import './MetagameGridEditor.css'

function mgUid() {
  return 'mg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

/** Integer 0–100 for a cell; empty → 0 for sums. */
function parseCellInt(raw) {
  if (raw === '' || raw == null) return 0
  const n = Number.parseInt(String(raw).trim(), 10)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function sumColumnExcludingRow(grid, colId, excludeRowId) {
  let sum = 0
  for (const row of grid.rows) {
    if (row.id === excludeRowId) continue
    sum += parseCellInt(grid.cells?.[row.id]?.[colId])
  }
  return sum
}

function columnSum(grid, colId) {
  let sum = 0
  for (const row of grid.rows) {
    sum += parseCellInt(grid.cells?.[row.id]?.[colId])
  }
  return sum
}

/** Status line after defaults load or refresh (warnings + static-snapshot hint). */
function formatDefaultsLoadedStatus(data) {
  const parts = []
  if (data.warning) parts.push(`Some formats failed to load: ${data.warning}`)
  if (data.fromStaticSnapshot) {
    parts.push(
      'Using build-time metagame snapshot (no live API on this host). “Refresh MTG Goldfish” needs serverless hosting — see docs/DEPLOYMENT.md.'
    )
  }
  return parts.join(' ').trim()
}

/**
 * MetagameGridEditor — rows are deck names, columns are metagame scenarios (each synced to a saved metagame).
 */
export default function MetagameGridEditor({ userId, format, onSynced }) {
  const MAX_METAGAME_COLUMNS = 5
  const [grid, setGrid] = useState(null)
  const [saveStatus, setSaveStatus] = useState('')
  const [defaultsStatus, setDefaultsStatus] = useState('')
  const [defaultsLoadedFor, setDefaultsLoadedFor] = useState('')
  const [goldfishRefreshing, setGoldfishRefreshing] = useState(false)
  const lockedColumnIds = getLockedMetagameColumnIds(grid || {})

  useEffect(() => {
    if (!userId || !format) {
      setGrid(null)
      return
    }
    setGrid(ensureMetagameGrid(userId, format))
    onSynced?.()
    // Intentionally omit onSynced from deps: parent passes a stable callback; we only re-run on format/user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, format])

  const persist = useCallback(
    (nextGrid) => {
      if (!userId || !format || !nextGrid) return
      saveMetagameGrid(userId, format, nextGrid)
      onSynced?.()
      setSaveStatus('Saved')
      window.setTimeout(() => setSaveStatus(''), 2000)
    },
    [userId, format, onSynced]
  )

  const handleSave = useCallback(() => {
    if (!grid) return
    persist(grid)
  }, [grid, persist])

  useEffect(() => {
    setDefaultsStatus('')
    setDefaultsLoadedFor('')
  }, [userId, format])

  useEffect(() => {
    if (!userId || !format || !grid) return
    if (defaultsLoadedFor === format) return
    setDefaultsLoadedFor(format)
    let cancelled = false
    ;(async () => {
      try {
        const payload = await fetchMetagameDefaults()
        if (cancelled) return
        const data = getDefaultsForFormat(payload, format)
        if (!Array.isArray(data.archetypes) || data.archetypes.length === 0) {
          setDefaultsStatus(
            data.fromStaticSnapshot && data.error
              ? `Metagame snapshot is empty or failed at build time: ${data.error} Rebuild with network access or use a host with /api/metagame-defaults.`
              : data.error
                ? `MTG Goldfish: ${data.error} Open your site’s /api/metagame-defaults?refresh=1 in a new tab to inspect the raw response.`
                : 'MTG Goldfish data is temporarily unavailable for this format. Try Refresh, or open /api/metagame-defaults?refresh=1 in a new tab.'
          )
          return
        }
        setGrid((prev) => {
          if (!prev) return prev
          const next = applyLockedGoldfishDefaults(prev, data, format)
          if (JSON.stringify(next) === JSON.stringify(prev)) return prev
          saveMetagameGrid(userId, format, next)
          onSynced?.()
          return next
        })
        setDefaultsStatus(formatDefaultsLoadedStatus(data))
      } catch (error) {
        if (cancelled) return
        setDefaultsStatus(error instanceof Error ? error.message : 'Could not load MTG Goldfish data.')
      }
    })()
    return () => { cancelled = true }
  }, [userId, format, grid, defaultsLoadedFor, onSynced])

  const handleRefreshGoldfish = useCallback(async () => {
    if (!userId || !format) return
    setGoldfishRefreshing(true)
    setDefaultsStatus('')
    try {
      const payload = await fetchMetagameDefaults({ refresh: true })
      const data = getDefaultsForFormat(payload, format)
      if (!Array.isArray(data.archetypes) || data.archetypes.length === 0) {
        setDefaultsStatus(
          data.fromStaticSnapshot && data.error
            ? `Metagame snapshot is empty: ${data.error}`
            : data.error
              ? `MTG Goldfish: ${data.error} Open /api/metagame-defaults?refresh=1 in a new tab to inspect the response.`
              : 'MTG Goldfish data is temporarily unavailable for this format. Open /api/metagame-defaults?refresh=1 to verify the API.'
        )
        return
      }
      setGrid((prev) => {
        if (!prev) return prev
        const next = applyLockedGoldfishDefaults(prev, data, format)
        saveMetagameGrid(userId, format, next)
        onSynced?.()
        return next
      })
      const loaded = formatDefaultsLoadedStatus(data)
      setDefaultsStatus(
        loaded || (data.fromStaticSnapshot ? '' : 'MTG Goldfish data refreshed.')
      )
    } catch (error) {
      setDefaultsStatus(error instanceof Error ? error.message : 'Could not refresh MTG Goldfish data.')
    } finally {
      setGoldfishRefreshing(false)
    }
  }, [userId, format, onSynced])

  const updateCell = useCallback((rowId, colId, rawValue) => {
    setGrid((prev) => {
      if (!prev) return prev
      if (getLockedMetagameColumnIds(prev).includes(colId)) return prev
      const trimmed = String(rawValue ?? '').trim()
      if (trimmed === '') {
        const cells = { ...prev.cells, [rowId]: { ...prev.cells[rowId], [colId]: '' } }
        return { ...prev, cells }
      }
      let n = Number.parseInt(trimmed, 10)
      if (Number.isNaN(n)) {
        const cells = { ...prev.cells, [rowId]: { ...prev.cells[rowId], [colId]: '' } }
        return { ...prev, cells }
      }
      n = Math.max(0, Math.min(100, n))
      const others = sumColumnExcludingRow(prev, colId, rowId)
      const maxAllowed = Math.max(0, 100 - others)
      n = Math.min(n, maxAllowed)
      const cells = { ...prev.cells, [rowId]: { ...prev.cells[rowId], [colId]: String(n) } }
      return { ...prev, cells }
    })
  }, [])

  const updateRowName = useCallback((rowId, name) => {
    setGrid((prev) => {
      if (!prev) return prev
      if (isLockedMetagameRow(prev, rowId)) return prev
      const rows = prev.rows.map((r) => (r.id === rowId ? { ...r, name } : r))
      return { ...prev, rows }
    })
  }, [])

  const updateColLabel = useCallback((colId, label) => {
    setGrid((prev) => {
      if (!prev) return prev
      if (getLockedMetagameColumnIds(prev).includes(colId)) return prev
      const columns = prev.columns.map((c) => (c.id === colId ? { ...c, label } : c))
      return { ...prev, columns }
    })
  }, [])

  const addColumn = useCallback(() => {
    setGrid((prev) => {
      if (!prev || prev.columns.length >= MAX_METAGAME_COLUMNS) return prev
      const n = prev.columns.length + 1
      const col = { id: mgUid(), label: `Metagame ${n}` }
      const cells = { ...prev.cells }
      prev.rows.forEach((r) => {
        cells[r.id] = { ...cells[r.id], [col.id]: '' }
      })
      return { ...prev, columns: [...prev.columns, col], cells }
    })
  }, [MAX_METAGAME_COLUMNS])

  const removeColumn = useCallback((colId) => {
    setGrid((prev) => {
      if (!prev || prev.columns.length <= 1) return prev
      if (getLockedMetagameColumnIds(prev).includes(colId)) return prev
      const columns = prev.columns.filter((c) => c.id !== colId)
      const cells = {}
      for (const row of prev.rows) {
        const rowCells = { ...prev.cells[row.id] }
        delete rowCells[colId]
        cells[row.id] = rowCells
      }
      return { ...prev, columns, cells }
    })
  }, [])

  const addRow = useCallback(() => {
    setGrid((prev) => {
      if (!prev) return prev
      const row = { id: mgUid(), name: '' }
      const cells = { ...prev.cells, [row.id]: {} }
      prev.columns.forEach((c) => {
        cells[row.id][c.id] = ''
      })
      return { ...prev, rows: [...prev.rows, row], cells }
    })
  }, [])

  const removeRow = useCallback((rowId) => {
    setGrid((prev) => {
      if (!prev || prev.rows.length <= 1) return prev
      if (isLockedMetagameRow(prev, rowId)) return prev
      const rows = prev.rows.filter((r) => r.id !== rowId)
      const cells = { ...prev.cells }
      delete cells[rowId]
      return { ...prev, rows, cells }
    })
  }, [])

  if (!grid) {
    return <p className="metagame-grid-loading">Loading metagame grid…</p>
  }

  return (
    <div className="metagame-grid-editor">
      <div className="metagame-grid-toolbar">
        <button type="button" className="metagame-grid-btn metagame-grid-btn-primary" onClick={handleSave}>
          Save changes
        </button>
        <button
          type="button"
          className="metagame-grid-btn metagame-grid-btn-secondary"
          onClick={handleRefreshGoldfish}
          disabled={goldfishRefreshing}
        >
          {goldfishRefreshing ? 'Refreshing…' : 'Refresh MTG Goldfish'}
        </button>
        {saveStatus ? <span className="metagame-grid-saved">{saveStatus}</span> : null}
      </div>
      {defaultsStatus ? <p className="metagame-grid-defaults-status">{defaultsStatus}</p> : null}

      <div className="metagame-grid-scroll">
        <table className="metagame-grid-table" aria-label="Metagame percentages by deck and scenario">
          <thead>
            <tr>
              <th className="metagame-grid-th-deck" scope="col">
                Deck name
              </th>
              {grid.columns.map((col) => (
                <th key={col.id} className="metagame-grid-th-meta" scope="col">
                  {lockedColumnIds.includes(col.id) ? (
                    <div className="metagame-grid-th-goldfish">
                      <div className="metagame-grid-goldfish-title">MTG Goldfish</div>
                      <div className="metagame-grid-goldfish-sub">
                        {col.label.includes('7') ? 'Last 7 days' : col.label.includes('14') ? 'Last 14 days' : 'Last 30 days'}
                      </div>
                      <div className="metagame-grid-goldfish-updated">
                        {(grid.defaults?.fetchedAtByWindow?.['7'] || grid.defaults?.fetchedAtByWindow?.['14'] || grid.defaults?.fetchedAtByWindow?.['30'] || grid.defaults?.fetchedAt)
                          ? `Updated ${new Date(
                            col.label.includes('7')
                              ? (grid.defaults?.fetchedAtByWindow?.['7'] || grid.defaults?.fetchedAt)
                              : col.label.includes('14')
                                ? (grid.defaults?.fetchedAtByWindow?.['14'] || grid.defaults?.fetchedAt)
                                : (grid.defaults?.fetchedAtByWindow?.['30'] || grid.defaults?.fetchedAt)
                          ).toLocaleDateString()}`
                          : 'Not loaded yet — use Refresh MTG Goldfish'}
                      </div>
                      <span className="metagame-grid-locked-badge metagame-grid-locked-badge--inline">Read-only</span>
                    </div>
                  ) : (
                    <div className="metagame-grid-th-meta-inner">
                      <textarea
                        className="metagame-grid-col-label"
                        value={col.label}
                        onChange={(e) => updateColLabel(col.id, e.target.value.replace(/\n/g, ' '))}
                        rows={3}
                        spellCheck={false}
                        aria-label="Metagame column name"
                      />
                      <button
                        type="button"
                        className="metagame-grid-col-remove"
                        onClick={() => removeColumn(col.id)}
                        disabled={grid.columns.length <= 1}
                        title={
                          grid.columns.length <= 1
                            ? 'At least one column required'
                            : 'Remove this metagame column'
                        }
                        aria-label="Remove column"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </th>
              ))}
              <th className="metagame-grid-th-add" scope="col">
                <button
                  type="button"
                  className="metagame-grid-btn metagame-grid-btn-add-col"
                  onClick={addColumn}
                  disabled={grid.columns.length >= MAX_METAGAME_COLUMNS}
                  title={
                    grid.columns.length >= MAX_METAGAME_COLUMNS
                      ? `Maximum ${MAX_METAGAME_COLUMNS} metagames`
                      : 'Add another metagame column'
                  }
                >
                  + Add Custom Metagame
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, idx) => (
              <tr key={row.id}>
                <td className="metagame-grid-td-deck">
                  <div className="metagame-grid-deck-cell">
                    <span className="metagame-grid-row-num">{idx + 1}</span>
                    <input
                      type="text"
                      className="metagame-grid-deck-name"
                      value={row.name}
                      onChange={(e) => updateRowName(row.id, e.target.value)}
                      placeholder={idx === 0 ? 'e.g. Izzet Lessons' : ''}
                      readOnly={isLockedMetagameRow(grid, row.id)}
                      size={Math.max(14, Math.min(52, Math.max((row.name || '').length + 2, 24)))}
                      aria-label={`Deck name row ${idx + 1}`}
                    />
                    <button
                      type="button"
                      className="metagame-grid-row-remove"
                      onClick={() => removeRow(row.id)}
                      disabled={grid.rows.length <= 1 || isLockedMetagameRow(grid, row.id)}
                      title={
                        isLockedMetagameRow(grid, row.id)
                          ? 'Default MTG Goldfish row cannot be removed'
                          : grid.rows.length <= 1
                            ? 'At least one row required'
                            : 'Remove row'
                      }
                      aria-label="Remove row"
                    >
                      ×
                    </button>
                  </div>
                </td>
                {grid.columns.map((col) => (
                  <td key={col.id} className="metagame-grid-td-pct">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="metagame-grid-pct-input"
                      value={(() => {
                        const raw = grid.cells[row.id]?.[col.id]
                        if (raw === undefined || raw === '') return ''
                        return String(parseCellInt(raw))
                      })()}
                      onChange={(e) => updateCell(row.id, col.id, e.target.value)}
                      placeholder="0"
                      readOnly={lockedColumnIds.includes(col.id)}
                      aria-label={`${col.label} % for ${row.name || `row ${idx + 1}`}`}
                    />
                  </td>
                ))}
                <td className="metagame-grid-td-spacer" aria-hidden="true" />
              </tr>
            ))}
            <tr className="metagame-grid-row-add-deck">
              <td colSpan={grid.columns.length + 2}>
                <button type="button" className="metagame-grid-btn metagame-grid-btn-secondary" onClick={addRow}>
                  + Add deck row
                </button>
              </td>
            </tr>
            <tr className="metagame-grid-row-other">
              <td className="metagame-grid-td-other-label">Other</td>
              {grid.columns.map((col) => {
                const sum = columnSum(grid, col.id)
                const other = Math.max(0, 100 - sum)
                return (
                  <td key={col.id} className="metagame-grid-td-other">
                    {other}%
                  </td>
                )
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
