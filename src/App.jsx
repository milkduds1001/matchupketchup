import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './contexts/AuthContext.jsx'
import Login from './components/Login.jsx'
import DeckUpload from './components/DeckUpload.jsx'
import MatchupTable from './components/MatchupTable.jsx'
import SideboardGuide from './components/SideboardGuide.jsx'
import MetagameInput from './components/MetagameInput.jsx'
import {
  FORMATS,
  getDecklists,
  getMetagames,
  getMatchupData,
  saveDecklist,
  saveMetagame,
  saveMatchupData,
  deleteDecklist,
  deleteMetagame,
} from './utils/storage.js'
import { fetchCardTypes } from './utils/scryfall.js'
import logo from './assets/matchupketchup_logo.svg'
import './App.css'

function generateId() {
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

function Dashboard() {
  const { user, logout } = useAuth()
  const [decklists, setDecklists] = useState([])
  const [metagames, setMetagames] = useState([])
  const [selectedDecklistId, setSelectedDecklistId] = useState(null)
  const [selectedMetagameId, setSelectedMetagameId] = useState(null)
  const [cards, setCards] = useState([])
  const [archetypes, setArchetypes] = useState([])
  const [cardTypes, setCardTypes] = useState({})
  const [matchupValues, setMatchupValues] = useState({})
  const [keysToMatchup, setKeysToMatchup] = useState({})
  const [hideLands, setHideLands] = useState(false)
  const [deckName, setDeckName] = useState('')
  const [deckFormat, setDeckFormat] = useState(FORMATS[0])
  const [metagameName, setMetagameName] = useState('')
  const [metagameFormat, setMetagameFormat] = useState(FORMATS[0])
  const [showAddDeckForm, setShowAddDeckForm] = useState(false)
  const [showAddMetagameForm, setShowAddMetagameForm] = useState(false)
  const [manageView, setManageView] = useState(null) // null | 'decklists' | 'metagames'

  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    setDecklists(getDecklists(userId))
    setMetagames(getMetagames(userId))
  }, [userId])

  const selectedDecklist = decklists.find((d) => d.id === selectedDecklistId)
  const selectedMetagame = metagames.find((m) => m.id === selectedMetagameId)
  const pairSelected = selectedDecklistId && selectedMetagameId

  // Metagames that match the selected deck's format (for "Choose a Metagame" dropdown)
  const metagamesForDeckFormat = selectedDecklist
    ? metagames.filter((m) => (m.format || '') === (selectedDecklist.format || ''))
    : []

  function loadDecklist(id) {
    const list = decklists.find((d) => d.id === id)
    if (!list) return
    setSelectedDecklistId(id)
    setCards(list.cards || [])
    setCardTypes(list.cardTypes || {})
    setDeckName(list.name)
    setDeckFormat(list.format || FORMATS[0])
    const currentMeta = metagames.find((m) => m.id === selectedMetagameId)
    if (currentMeta && (currentMeta.format || '') !== (list.format || '')) {
      clearMetagameSelection()
    }
  }

  function loadMetagame(id) {
    const meta = metagames.find((m) => m.id === id)
    if (!meta) return
    setSelectedMetagameId(id)
    setArchetypes(meta.archetypes || [])
    setMetagameName(meta.name)
    setMetagameFormat(meta.format || FORMATS[0])
  }

  function clearDeckSelection() {
    setSelectedDecklistId(null)
    setCards([])
    setCardTypes({})
    setDeckName('')
  }

  function clearMetagameSelection() {
    setSelectedMetagameId(null)
    setArchetypes([])
    setMetagameName('')
  }

  useEffect(() => {
    if (!pairSelected || !userId) return
    const data = getMatchupData(userId, selectedDecklistId, selectedMetagameId)
    setMatchupValues(data.matchupValues)
    setKeysToMatchup(data.keysToMatchup)
  }, [userId, selectedDecklistId, selectedMetagameId, pairSelected])

  const saveMatchupDataForPair = useCallback(
    (values, keys) => {
      if (!userId || !selectedDecklistId || !selectedMetagameId) return
      saveMatchupData(userId, selectedDecklistId, selectedMetagameId, {
        matchupValues: values,
        keysToMatchup: keys,
      })
    },
    [userId, selectedDecklistId, selectedMetagameId]
  )

  useEffect(() => {
    if (!pairSelected) return
    saveMatchupDataForPair(matchupValues, keysToMatchup)
  }, [matchupValues, keysToMatchup, pairSelected, saveMatchupDataForPair])

  useEffect(() => {
    if (!Array.isArray(cards) || cards.length === 0) return
    const names = [...new Set(cards.map((c) => c?.name).filter(Boolean))]
    const toFetch = names.filter((name) => !cardTypes[name])
    if (toFetch.length === 0) return
    let cancelled = false
    fetchCardTypes(toFetch, (name, typeLine) => {
      if (cancelled) return
      setCardTypes((prev) => {
        if (prev[name] === (typeLine ?? undefined)) return prev
        const next = { ...prev }
        if (typeLine != null) next[name] = typeLine
        return next
      })
    })
    return () => { cancelled = true }
  }, [cards])

  function handleMatchupChange(cardKey, archetypeId, rawValue) {
    if (!/^-?\d*$/.test(rawValue)) return
    setMatchupValues((prev) => {
      const next = { ...prev }
      if (rawValue === '') {
        if (cardKey.includes('::sideboard::')) next[cardKey] = ''
        else delete next[cardKey]
      } else next[cardKey] = rawValue
      return next
    })
  }

  function handleArchetypesChange(list) {
    setArchetypes(list.map(({ id, name, metaPercent }) => ({ id, name, metagamePercent: metaPercent })))
  }

  function handleKeysToMatchupChange(archetypeName, text) {
    setKeysToMatchup((prev) => {
      const next = { ...prev }
      if (text === '') delete next[archetypeName]
      else next[archetypeName] = text
      return next
    })
  }

  function handleSaveDecklist() {
    const name = deckName.trim()
    if (!name || !userId) return
    const id = selectedDecklistId || generateId()
    saveDecklist(userId, {
      id,
      name,
      format: deckFormat,
      cards: [...cards],
      cardTypes: { ...cardTypes },
    })
    setDecklists(getDecklists(userId))
    setSelectedDecklistId(id)
  }

  function handleDeleteDecklist(id) {
    if (!userId) return
    deleteDecklist(userId, id)
    setDecklists(getDecklists(userId))
    if (selectedDecklistId === id) clearDeckSelection()
  }

  function handleSaveMetagame() {
    const name = metagameName.trim()
    if (!name || !userId) return
    const id = selectedMetagameId || generateId()
    saveMetagame(userId, {
      id,
      name,
      format: metagameFormat,
      archetypes: archetypes.map((a) => ({ ...a })),
    })
    setMetagames(getMetagames(userId))
    setSelectedMetagameId(id)
  }

  function handleDeleteMetagame(id) {
    if (!userId) return
    deleteMetagame(userId, id)
    setMetagames(getMetagames(userId))
    if (selectedMetagameId === id) clearMetagameSelection()
  }

  return (
    <div className="app">
      <main className="main-content">
        {!manageView && (
          <div className="top-row">
            <img src={logo} alt="MatchupKetchup" className="header-logo" />
            <div className="top-choice-sections">
              <section className="section section-compact section-step deck-section">
                <h2 className="step-title">Step 1: Select Decklist</h2>
                <div className="crud-row">
                  <label className="crud-label">
                    Decklist
                    <select
                      value={selectedDecklistId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '') clearDeckSelection()
                        else loadDecklist(v)
                      }}
                      className="crud-select"
                    >
                      <option value="">—</option>
                      {decklists.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.format})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" className="btn-add-new btn-in-step" onClick={() => setManageView('decklists')}>
                  Add or modify decklists
                </button>
              </section>
              <section className="section section-compact section-step metagame-section">
                <h2 className="step-title">Step 2: Select a Metagame</h2>
                <div className="crud-row">
                  <label className="crud-label">
                    Metagame
                    <select
                      value={selectedMetagameId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '') clearMetagameSelection()
                        else loadMetagame(v)
                      }}
                      className="crud-select"
                      disabled={!selectedDecklist}
                    >
                      <option value="">
                        {selectedDecklist ? '—' : 'Select a deck first'}
                      </option>
                      {metagamesForDeckFormat.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" className="btn-add-new btn-in-step" onClick={() => setManageView('metagames')}>
                  Add or modify metagames
                </button>
              </section>
            </div>
            <div className="header-actions">
              <span className="header-user">Signed in as {user?.email}</span>
              <button type="button" className="btn-reset" onClick={logout}>
                Sign out
              </button>
            </div>
          </div>
        )}
        {manageView === 'decklists' && (
          <div className="manage-view">
            <div className="manage-view-header">
              <button type="button" className="btn-back" onClick={() => setManageView(null)}>
                ← Back
              </button>
              <h2 className="manage-view-title">Modify your decklists</h2>
              <div className="header-actions" style={{ marginLeft: 'auto' }}>
                <span className="header-user">Signed in as {user?.email}</span>
                <button type="button" className="btn-reset" onClick={logout}>
                  Sign out
                </button>
              </div>
            </div>
            <div className="manage-view-content">
              <section className="section section-compact deck-section">
                <h2>Decklists</h2>
                {decklists.length > 0 && (
                  <>
                    <p className="crud-list-label">Existing decklists</p>
                    <ul className="saved-list">
                      {decklists.map((d) => (
                        <li key={d.id} className="saved-item">
                          <span>{d.name} ({d.format})</span>
                          <div>
                            <button type="button" className="btn-small" onClick={() => loadDecklist(d.id)}>Load</button>
                            <button type="button" className="btn-small btn-danger" onClick={() => handleDeleteDecklist(d.id)}>Delete</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="crud-row">
                  <label className="crud-label">
                    Select deck to edit
                    <select
                      value={selectedDecklistId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '') clearDeckSelection()
                        else loadDecklist(v)
                      }}
                      className="crud-select"
                    >
                      <option value="">—</option>
                      {decklists.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.format})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {selectedDecklistId && (
                  <div className="crud-row crud-actions">
                    <input
                      type="text"
                      value={deckName}
                      onChange={(e) => setDeckName(e.target.value)}
                      placeholder="Deck name"
                      className="crud-input"
                    />
                    <select value={deckFormat} onChange={(e) => setDeckFormat(e.target.value)} className="crud-select narrow">
                      {FORMATS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <button type="button" className="btn-save" onClick={handleSaveDecklist}>
                      Update decklist
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="btn-add-new"
                  onClick={() => setShowAddDeckForm((v) => !v)}
                >
                  {showAddDeckForm ? 'Cancel' : 'Add new decklist'}
                </button>
                {showAddDeckForm && (
                  <>
                    <DeckUpload onCardsParsed={(c) => { setCards(c); setSelectedDecklistId(null) }} />
                    <div className="crud-row crud-actions">
                      <input
                        type="text"
                        value={deckName}
                        onChange={(e) => setDeckName(e.target.value)}
                        placeholder="Deck name"
                        className="crud-input"
                      />
                      <select value={deckFormat} onChange={(e) => setDeckFormat(e.target.value)} className="crud-select narrow">
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                      <button type="button" className="btn-save" onClick={() => { handleSaveDecklist(); setShowAddDeckForm(false) }}>
                        Save
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        )}
        {manageView === 'metagames' && (
          <div className="manage-view">
            <div className="manage-view-header">
              <button type="button" className="btn-back" onClick={() => setManageView(null)}>
                ← Back
              </button>
              <h2 className="manage-view-title">Modify your metagames</h2>
              <div className="header-actions" style={{ marginLeft: 'auto' }}>
                <span className="header-user">Signed in as {user?.email}</span>
                <button type="button" className="btn-reset" onClick={logout}>
                  Sign out
                </button>
              </div>
            </div>
            <div className="manage-view-content">
              <section className="section section-compact metagame-section">
                <h2>Metagames</h2>
                {metagames.length > 0 && (
                  <>
                    <p className="crud-list-label">Existing metagames</p>
                    <ul className="saved-list">
                      {metagames.map((m) => (
                        <li key={m.id} className="saved-item">
                          <span>{m.name} ({m.format})</span>
                          <div>
                            <button type="button" className="btn-small" onClick={() => loadMetagame(m.id)}>Load</button>
                            <button type="button" className="btn-small btn-danger" onClick={() => handleDeleteMetagame(m.id)}>Delete</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="crud-row">
                  <label className="crud-label">
                    Select metagame to edit
                    <select
                      value={selectedMetagameId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '') clearMetagameSelection()
                        else loadMetagame(v)
                      }}
                      className="crud-select"
                    >
                      <option value="">—</option>
                      {metagames.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.format})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {selectedMetagameId && (
                  <div className="crud-row crud-actions">
                    <input
                      type="text"
                      value={metagameName}
                      onChange={(e) => setMetagameName(e.target.value)}
                      placeholder="Metagame name"
                      className="crud-input"
                    />
                    <select value={metagameFormat} onChange={(e) => setMetagameFormat(e.target.value)} className="crud-select narrow">
                      {FORMATS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <button type="button" className="btn-save" onClick={handleSaveMetagame}>
                      Update metagame
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="btn-add-new"
                  onClick={() => setShowAddMetagameForm((v) => !v)}
                >
                  {showAddMetagameForm ? 'Cancel' : 'Add new metagame'}
                </button>
                {showAddMetagameForm && (
                  <>
                    <MetagameInput
                      key="new-metagame-form"
                      archetypes={archetypes}
                      onArchetypesChange={handleArchetypesChange}
                    />
                    <div className="crud-row crud-actions">
                      <input
                        type="text"
                        value={metagameName}
                        onChange={(e) => setMetagameName(e.target.value)}
                        placeholder="Metagame name"
                        className="crud-input"
                      />
                      <select value={metagameFormat} onChange={(e) => setMetagameFormat(e.target.value)} className="crud-select narrow">
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                      <button type="button" className="btn-save" onClick={() => { handleSaveMetagame(); setShowAddMetagameForm(false) }}>
                        Save
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        )}

        {!manageView && !pairSelected && (
          <section className="section section-message">
            <p>Select a decklist and a metagame above to view and edit the matchup table and sideboard guide. Data is saved per deck + metagame pair.</p>
          </section>
        )}

        {!manageView && pairSelected && (
          <>
            <header className="print-header" aria-hidden="true">
              <img src={logo} alt="" className="print-header-logo" />
              <div className="print-header-info">
                <div className="print-header-row print-header-titles">
                  <span className="print-header-label">Deck:</span>
                  <span className="print-header-value">{selectedDecklist?.name ?? '—'}</span>
                </div>
                <div className="print-header-row print-header-titles">
                  <span className="print-header-label">Meta:</span>
                  <span className="print-header-value">{selectedMetagame?.name ?? '—'}</span>
                </div>
                <div className="print-header-row">
                  <span className="print-header-label">Name:</span>
                  <span className="print-header-underline" />
                </div>
                <div className="print-header-row">
                  <span className="print-header-label">Date:</span>
                  <span className="print-header-underline" />
                </div>
              </div>
            </header>
            <section className="section matchup-table">
              <div className="section-actions">
                <h2 className="step3-title">
                  Step 3: Create Your Sideboard Plan<br />
                  <span className="step3-line-normal">Deck: {selectedDecklist?.name}</span><br />
                  <span className="step3-line-normal">vs. {selectedMetagame?.name}</span>
                </h2>
                <label className="toggle-hide-lands">
                  <input type="checkbox" checked={hideLands} onChange={(e) => setHideLands(e.target.checked)} />
                  <span className="toggle-hide-lands-label">Hide lands in table &amp; PDF</span>
                </label>
                <button type="button" className="btn-print" onClick={() => window.print()} title="Print or save as PDF">
                  Print / Save as PDF
                </button>
                <button type="button" className="btn-reset" onClick={() => setMatchupValues({})} title="Clear all matchup cell values">
                  Reset matchup values
                </button>
              </div>
              <MatchupTable
                cards={cards}
                archetypes={archetypes}
                values={matchupValues}
                cardTypes={cardTypes}
                hideLands={hideLands}
                onChangeCell={handleMatchupChange}
              />
            </section>

            <section className="section sideboard-guide-section">
              <h2>Sideboard Guide</h2>
              <SideboardGuide
                archetypes={archetypes}
                matchupValues={matchupValues}
                keysToMatchup={keysToMatchup}
                onKeysChange={handleKeysToMatchupChange}
              />
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default function App() {
  const { user } = useAuth()
  if (!user) return <Login />
  return <Dashboard />
}
