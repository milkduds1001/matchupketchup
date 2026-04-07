import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import Login from './components/Login.jsx'
import HomePage from './components/HomePage.jsx'
import DeckUpload from './components/DeckUpload.jsx'
import MatchupTable from './components/MatchupTable.jsx'
import SideboardGuide from './components/SideboardGuide.jsx'
import MetagameGridEditor from './components/MetagameGridEditor.jsx'
import {
  DEFAULT_FORMATS,
  getFormats,
  ensureMetagameGrid,
  saveFormats,
  getDecklists,
  getMetagames,
  getMatchupData,
  saveDecklist,
  saveMatchupData,
  deleteDecklist,
} from './utils/storage.js'
import { migrateLegacyUnifiedToPlayDraw } from './utils/matchupKeys.js'
import {
  syncGoldfishDefaultsForAllFormats,
  syncGoldfishDefaultsForFormat,
} from './utils/syncGoldfishDefaults.js'
import { setPrintPageLayout } from './utils/printPage.js'
import { copyDeckAndOpenDecklistOrg } from './utils/decklistOrgExport.js'
import { fetchCardMetadata, fetchCardImageUrlByName, searchCardsByName } from './utils/scryfall.js'
import logo from './assets/matchupketchup_logo_mark.png'
import './App.css'

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G']
const LEGALITY_FORMATS = new Set(['standard', 'pioneer', 'modern', 'legacy'])
/** Compare format strings case-insensitively (deck / metagame may differ in casing). */
function formatsMatch(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
}

function alphaCompare(a, b) {
  return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare(
    String(a ?? '').trim(),
    String(b ?? '').trim()
  )
}

const BASIC_LAND_FALLBACK = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes',
  'snow-covered plains',
  'snow-covered island',
  'snow-covered swamp',
  'snow-covered mountain',
  'snow-covered forest',
])
const COLOR_SYMBOL_URLS = {
  W: 'https://svgs.scryfall.io/card-symbols/W.svg',
  U: 'https://svgs.scryfall.io/card-symbols/U.svg',
  B: 'https://svgs.scryfall.io/card-symbols/B.svg',
  R: 'https://svgs.scryfall.io/card-symbols/R.svg',
  G: 'https://svgs.scryfall.io/card-symbols/G.svg',
}

const DECK_GROUP_CREATURES_PLANESWALKERS = 'Creatures & Planeswalkers'
const DECK_GROUP_OTHER_SPELLS = 'Other Spells'
const DECK_GROUP_LANDS = 'Lands'
const DECK_GROUP_ORDER = [
  DECK_GROUP_CREATURES_PLANESWALKERS,
  DECK_GROUP_OTHER_SPELLS,
  DECK_GROUP_LANDS,
]

function getDeckGroup(typeLine) {
  if (!typeLine || typeof typeLine !== 'string') return DECK_GROUP_OTHER_SPELLS
  const lower = typeLine.toLowerCase()
  if (lower.includes('land')) return DECK_GROUP_LANDS
  if (lower.includes('creature') || lower.includes('planeswalker')) return DECK_GROUP_CREATURES_PLANESWALKERS
  return DECK_GROUP_OTHER_SPELLS
}

function generateId() {
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

function deckEditorSnapshot(name, format, cards) {
  const norm = (cards || []).map((c) => ({
    id: String(c?.id || ''),
    name: String(c?.name || '').trim(),
    quantity: Math.max(1, Number.parseInt(String(c?.quantity), 10) || 1),
    zone: c?.zone === 'sideboard' ? 'sideboard' : 'main',
  }))
  norm.sort((a, b) => {
    const z = a.zone.localeCompare(b.zone)
    if (z !== 0) return z
    const n = a.name.localeCompare(b.name)
    if (n !== 0) return n
    return a.id.localeCompare(b.id)
  })
  return JSON.stringify({
    name: String(name ?? '').trim(),
    format: String(format ?? ''),
    cards: norm,
  })
}

function normalizeDeckCards(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((card) => card && typeof card === 'object' && typeof card.name === 'string')
    .map((card, idx) => ({
      id: card.id || `legacy-${idx}-${card.name}`,
      name: card.name.trim(),
      quantity: Math.max(1, Number.parseInt(String(card.quantity), 10) || 1),
      zone: card.zone === 'sideboard' ? 'sideboard' : 'main',
    }))
    .filter((card) => card.name)
}

class DashboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Dashboard render error:', error, info?.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="dashboard-crash" role="alert">
          <strong>Something went wrong in the app.</strong>
          <p>{this.state.message || 'Unknown error'}</p>
          <button type="button" className="btn-reset" onClick={() => this.setState({ hasError: false, message: '' })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

class DeckEditorErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  componentDidCatch(error) {
    // Keep console trace during troubleshooting.
    // eslint-disable-next-line no-console
    console.error('Deck editor crashed:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="deck-editor-crash">
          <strong>Deck editor error:</strong> {this.state.message || 'Unknown runtime error'}
        </div>
      )
    }
    return this.props.children
  }
}

function Dashboard({ onGoHome }) {
  const { user, logout } = useAuth()
  const [formats, setFormats] = useState(DEFAULT_FORMATS)
  const [decklists, setDecklists] = useState([])
  const [metagames, setMetagames] = useState([])
  const [selectedFormat, setSelectedFormat] = useState('')
  const [selectedDecklistId, setSelectedDecklistId] = useState(null)
  const [selectedMetagameId, setSelectedMetagameId] = useState(null)
  const [cards, setCards] = useState([])
  const [cardTypes, setCardTypes] = useState({})
  const [cardColorIdentities, setCardColorIdentities] = useState({})
  const [cardLegalities, setCardLegalities] = useState({})
  const [matchupValues, setMatchupValues] = useState({})
  const [keysToMatchup, setKeysToMatchup] = useState({})
  const [hideLands, setHideLands] = useState(false)
  const [matchupDisplayCount, setMatchupDisplayCount] = useState('10') // '5' | '10' | 'all'
  const [resetMatchupModalOpen, setResetMatchupModalOpen] = useState(false)
  const [newFormatName, setNewFormatName] = useState('')
  const [deckName, setDeckName] = useState('')
  const [deckFormat, setDeckFormat] = useState(DEFAULT_FORMATS[0])
  const [manageMetaFormat, setManageMetaFormat] = useState(DEFAULT_FORMATS[0])
  const [deckEditorMode, setDeckEditorMode] = useState('create') // create | import | edit
  const [deckSearchQuery, setDeckSearchQuery] = useState('')
  const [deckSearchResults, setDeckSearchResults] = useState([])
  const [deckSearchLoading, setDeckSearchLoading] = useState(false)
  const [deckCardPreviewUrls, setDeckCardPreviewUrls] = useState({})
  const [activePreviewCardName, setActivePreviewCardName] = useState('')
  /** Client coordinates for matchup matrix card preview tooltip (fixed to viewport). */
  const [matchupPreviewPoint, setMatchupPreviewPoint] = useState(null)
  const [manageView, setManageView] = useState(null) // null | 'formats' | 'decklists' | 'deck-editor' | 'metagames'
  const [manageDecklistFormatFilter, setManageDecklistFormatFilter] = useState('')
  const deckEditorBaselineRef = useRef(null)
  const [deckEditorNameEditing, setDeckEditorNameEditing] = useState(false)
  const [deckEditorFormatEditing, setDeckEditorFormatEditing] = useState(false)

  const userId = user?.id

  const deckMetaMigrationBusyRef = useRef(false)
  /** Avoid re-applying storage + setState every render (was causing matchup table flicker). */
  const matchupHydratedPairKeyRef = useRef('')

  const refreshMetagames = useCallback(() => {
    if (!userId) return
    for (const f of getFormats(userId)) ensureMetagameGrid(userId, f)
    const list = getMetagames(userId)
    setMetagames(list)
    setSelectedMetagameId((prev) => {
      if (!prev) return prev
      return list.some((m) => m.id === prev) ? prev : null
    })
  }, [userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const availableFormats = getFormats(userId)
    for (const f of availableFormats) ensureMetagameGrid(userId, f)
    setFormats(availableFormats)
    setDeckFormat((prev) => (availableFormats.includes(prev) ? prev : availableFormats[0] || DEFAULT_FORMATS[0]))
    setManageMetaFormat((prev) => (availableFormats.includes(prev) ? prev : availableFormats[0] || DEFAULT_FORMATS[0]))
    setDecklists(getDecklists(userId))
    const metaList = getMetagames(userId)
    setMetagames(metaList)
    setSelectedMetagameId((prev) => {
      if (!prev) return prev
      return metaList.some((m) => m.id === prev) ? prev : null
    })

    ;(async () => {
      try {
        await syncGoldfishDefaultsForAllFormats(userId, { refresh: false })
      } catch {
        /* ignore — offline or API unavailable */
      }
      if (cancelled) return
      for (const f of getFormats(userId)) ensureMetagameGrid(userId, f)
      const list = getMetagames(userId)
      setMetagames(list)
      setSelectedMetagameId((prev) => {
        if (!prev) return prev
        return list.some((m) => m.id === prev) ? prev : null
      })
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!resetMatchupModalOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setResetMatchupModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resetMatchupModalOpen])

  const deckMigrationSignature = useMemo(() => {
    return decklists
      .filter(
        (d) =>
          !d.colorIdentities
          || typeof d.colorIdentities !== 'object'
          || !d.cardLegalities
          || typeof d.cardLegalities !== 'object'
      )
      .map((d) => d.id)
      .slice()
      .sort()
      .join('|')
  }, [decklists])

  useEffect(() => {
    if (!userId || !deckMigrationSignature || deckMetaMigrationBusyRef.current) return
    const decksMissingMeta = decklists.filter(
      (d) =>
        !d.colorIdentities
        || typeof d.colorIdentities !== 'object'
        || !d.cardLegalities
        || typeof d.cardLegalities !== 'object'
    )
    if (decksMissingMeta.length === 0) return
    deckMetaMigrationBusyRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        for (const deck of decksMissingMeta) {
          const names = [...new Set((deck.cards || []).map((c) => c?.name).filter(Boolean))]
          const identityMap = {}
          const legalityMap = {}
          await fetchCardMetadata(names, (name, meta) => {
            if (cancelled) return
            identityMap[name] = Array.isArray(meta?.color_identity) ? meta.color_identity : []
            legalityMap[name] = meta?.legalities && typeof meta.legalities === 'object' ? meta.legalities : {}
          }, 0)
          if (cancelled) return
          saveDecklist(userId, {
            ...deck,
            colorIdentities: identityMap,
            cardLegalities: legalityMap,
            updatedAt: deck.updatedAt,
          })
        }
        if (!cancelled) setDecklists(getDecklists(userId))
      } finally {
        deckMetaMigrationBusyRef.current = false
      }
    })()
    return () => { cancelled = true }
  }, [userId, deckMigrationSignature, decklists])

  useEffect(() => {
    if (!formats.includes(selectedFormat)) {
      setSelectedFormat('')
    }
    setDeckFormat((prev) => (formats.includes(prev) ? prev : formats[0] || DEFAULT_FORMATS[0]))
    setManageMetaFormat((prev) => (formats.includes(prev) ? prev : formats[0] || DEFAULT_FORMATS[0]))
  }, [formats, selectedFormat])

  const selectedDecklist = decklists.find((d) => d.id === selectedDecklistId)
  const selectedMetagame = metagames.find((m) => m.id === selectedMetagameId)

  /** Keep locked Goldfish columns aligned with the selected deck’s format (fixes stale Standard data after switching to Modern, etc.). */
  useEffect(() => {
    if (!userId || !selectedDecklist?.format) return
    let cancelled = false
    const fmt = selectedDecklist.format
    ;(async () => {
      try {
        await syncGoldfishDefaultsForFormat(userId, fmt, { refresh: false })
      } catch {
        /* ignore */
      }
      if (!cancelled) refreshMetagames()
    })()
    return () => {
      cancelled = true
    }
  }, [userId, selectedDecklist?.format, refreshMetagames])

  const archetypes = useMemo(() => {
    const raw = selectedMetagame?.archetypes
    if (!Array.isArray(raw)) return []
    const filtered = raw.filter(
      (a) => a != null && typeof a === 'object' && typeof a.name === 'string' && a.name.trim()
    )
    return [...filtered].sort((a, b) => {
      const pa = Number.parseFloat(String(a?.metagamePercent ?? '').replace('%', '').trim())
      const pb = Number.parseFloat(String(b?.metagamePercent ?? '').replace('%', '').trim())
      const va = Number.isNaN(pa) ? 0 : pa
      const vb = Number.isNaN(pb) ? 0 : pb
      if (vb !== va) return vb - va
      return String(a.name).localeCompare(String(b.name))
    })
  }, [selectedMetagame])
  const displayedArchetypes = useMemo(() => {
    if (!Array.isArray(archetypes) || archetypes.length === 0) return []
    if (matchupDisplayCount === 'all') return archetypes
    const n = Number.parseInt(matchupDisplayCount, 10)
    if (Number.isNaN(n) || n <= 0) return archetypes
    return archetypes.slice(0, n)
  }, [archetypes, matchupDisplayCount])
  const sideboardGuideArchetypes = useMemo(() => {
    const minPct = (arch) => {
      const n = Number.parseFloat(String(arch?.metagamePercent ?? '').replace('%', '').trim())
      return !Number.isNaN(n) && n >= 1
    }
    return displayedArchetypes.filter(minPct)
  }, [displayedArchetypes])
  const safeCards = useMemo(() => normalizeDeckCards(cards), [cards])
  const pairSelected = selectedDecklistId && selectedMetagameId
  const isStep1Complete = Boolean(selectedFormat)
  const isStep2Complete = Boolean(selectedDecklistId)
  const isStep3Complete = Boolean(selectedMetagameId)
  const isStep2Locked = !isStep1Complete
  const isStep3Locked = !isStep2Complete
  const nextPrintRequirement = !selectedFormat
    ? 'Step 1 is required: select a format.'
    : !selectedDecklistId
    ? 'Step 2 is required: select a decklist.'
    : !selectedMetagameId
    ? 'Step 3 is required: select a metagame.'
    : ''

  function formatTimestamp(ts) {
    if (!ts) return '—'
    const date = new Date(ts)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
  }

  function getDeckColorIdentity(deck) {
    const map = deck?.colorIdentities
    if (!map || typeof map !== 'object') return []
    const colors = new Set()
    for (const card of deck.cards || []) {
      const ids = map[card?.name]
      if (!Array.isArray(ids)) continue
      ids.forEach((c) => {
        if (COLOR_ORDER.includes(c)) colors.add(c)
      })
    }
    return COLOR_ORDER.filter((c) => colors.has(c))
  }

  function getDeckLegality(deck) {
    const format = String(deck?.format || '').toLowerCase()
    if (!LEGALITY_FORMATS.has(format)) {
      return { isRelevant: false, hasIssue: false, issues: [] }
    }

    const normalizedCards = normalizeDeckCards(deck?.cards || [])
    const mainDeck = normalizedCards.filter((card) => card.zone !== 'sideboard')
    const sideboard = normalizedCards.filter((card) => card.zone === 'sideboard')
    const mainCount = mainDeck.reduce((sum, card) => sum + (Number(card.quantity) || 0), 0)
    const sideboardCount = sideboard.reduce((sum, card) => sum + (Number(card.quantity) || 0), 0)
    const issues = []

    if (mainCount < 60) {
      issues.push({
        code: 'main-count',
        icon: '📏',
        message: `Main deck has ${mainCount} cards (minimum 60).`,
      })
    }
    if (sideboardCount > 15) {
      issues.push({
        code: 'side-count',
        icon: '🎒',
        message: `Sideboard has ${sideboardCount} cards (maximum 15).`,
      })
    }

    const legalityMap = deck?.cardLegalities && typeof deck.cardLegalities === 'object'
      ? deck.cardLegalities
      : {}
    const bannedOrRestricted = []
    for (const card of normalizedCards) {
      const legalities = legalityMap[card.name]
      const status = legalities && typeof legalities === 'object' ? legalities[format] : null
      if (status === 'banned' || status === 'restricted') bannedOrRestricted.push(card.name)
    }
    if (bannedOrRestricted.length > 0) {
      issues.push({
        code: 'banned-restricted',
        icon: '⛔',
        message: `Includes banned/restricted cards: ${[...new Set(bannedOrRestricted)].join(', ')}`,
      })
    }

    const notLegalInFormat = []
    for (const card of normalizedCards) {
      const legalities = legalityMap[card.name]
      const status = legalities && typeof legalities === 'object' ? legalities[format] : null
      if (status === 'not_legal') notLegalInFormat.push(card.name)
    }
    if (notLegalInFormat.length > 0) {
      const formatLabel = format.charAt(0).toUpperCase() + format.slice(1)
      issues.push({
        code: 'not-legal-in-format',
        icon: '📕',
        message: `Not legal in ${formatLabel} (not in that format's card pool): ${[...new Set(notLegalInFormat)].join(', ')}`,
      })
    }

    const cardTypesMap = deck?.cardTypes && typeof deck.cardTypes === 'object' ? deck.cardTypes : {}
    const copiesByName = {}
    for (const card of normalizedCards) {
      const name = String(card.name || '').trim()
      if (!name) continue
      copiesByName[name] = (copiesByName[name] || 0) + (Number(card.quantity) || 0)
    }
    const illegalCopies = Object.entries(copiesByName)
      .filter(([name, copies]) => {
        if (copies <= 4) return false
        const lower = name.toLowerCase()
        if (BASIC_LAND_FALLBACK.has(lower)) return false
        const typeLine = String(cardTypesMap[name] || '').toLowerCase()
        if (typeLine.includes('basic land')) return false
        return true
      })
      .map(([name, copies]) => `${name} (${copies})`)
    if (illegalCopies.length > 0) {
      issues.push({
        code: 'max-copies',
        icon: '[>]',
        message: `More than 4 copies (excluding basic lands): ${illegalCopies.join(', ')}`,
      })
    }

    return { isRelevant: true, hasIssue: issues.length > 0, issues }
  }

  function sortDecklistsByLegality(list) {
    return [...list].sort((a, b) => {
      const la = getDeckLegality(a)
      const lb = getDeckLegality(b)
      const aBad = la.isRelevant && la.hasIssue
      const bBad = lb.isRelevant && lb.hasIssue
      if (aBad !== bBad) return aBad ? 1 : -1
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }

  const sortedFormats = useMemo(
    () => [...formats].sort((a, b) => alphaCompare(a, b)),
    [formats]
  )

  const matchupCursorPreviewStyle = useMemo(() => {
    if (!matchupPreviewPoint || !activePreviewCardName) return null
    const margin = 14
    const boxW = 140
    const boxH = 220
    let left = matchupPreviewPoint.x + margin
    let top = matchupPreviewPoint.y + margin
    if (typeof window !== 'undefined') {
      left = Math.min(Math.max(8, left), window.innerWidth - boxW - 8)
      top = Math.min(Math.max(8, top), window.innerHeight - boxH - 8)
    }
    return {
      position: 'fixed',
      left,
      top,
      zIndex: 4000,
      pointerEvents: 'none',
    }
  }, [matchupPreviewPoint, activePreviewCardName])

  const decklistsForFormat = selectedFormat
    ? [...decklists.filter((d) => (d.format || '') === selectedFormat)].sort((a, b) => alphaCompare(a?.name, b?.name))
    : []

  const decklistsFilteredForManage = manageDecklistFormatFilter
    ? decklists.filter((d) => (d.format || '') === manageDecklistFormatFilter)
    : decklists
  const sortedDecklistsForTable = sortDecklistsByLegality(decklistsFilteredForManage)

  function sortDeckCardsForEditor(cardList) {
    return [...cardList].sort((a, b) => {
      const groupA = getDeckGroup(cardTypes[a?.name])
      const groupB = getDeckGroup(cardTypes[b?.name])
      const groupRankA = DECK_GROUP_ORDER.indexOf(groupA)
      const groupRankB = DECK_GROUP_ORDER.indexOf(groupB)
      if (groupRankA !== groupRankB) return groupRankA - groupRankB
      return String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
    })
  }

  const editorMainDeckCards = sortDeckCardsForEditor(safeCards.filter((card) => card.zone !== 'sideboard'))
  const editorSideboardCards = sortDeckCardsForEditor(safeCards.filter((card) => card.zone === 'sideboard'))
  const editorCreaturesWalkers = editorMainDeckCards.filter(
    (card) => getDeckGroup(cardTypes[card.name]) === DECK_GROUP_CREATURES_PLANESWALKERS
  )
  const editorOtherSpells = editorMainDeckCards.filter(
    (card) => getDeckGroup(cardTypes[card.name]) === DECK_GROUP_OTHER_SPELLS
  )
  const editorLands = editorMainDeckCards.filter(
    (card) => getDeckGroup(cardTypes[card.name]) === DECK_GROUP_LANDS
  )
  const mainDeckTotalCards = editorMainDeckCards.reduce((sum, card) => sum + (Number(card.quantity) || 0), 0)
  const sideboardTotalCards = editorSideboardCards.reduce((sum, card) => sum + (Number(card.quantity) || 0), 0)

  const deckEditorBlockGroups = [
    { key: 'cw', title: DECK_GROUP_CREATURES_PLANESWALKERS, cards: editorCreaturesWalkers },
    { key: 'os', title: DECK_GROUP_OTHER_SPELLS, cards: editorOtherSpells },
    { key: 'lands', title: DECK_GROUP_LANDS, cards: editorLands },
    { key: 'side', title: 'Sideboard', cards: editorSideboardCards },
  ]

  // Metagames that match the selected deck's format (for "Choose a Metagame" dropdown)
  const metagamesForDeckFormat = selectedDecklist
    ? [...metagames.filter((m) => formatsMatch(m.format, selectedDecklist.format))].sort((a, b) => alphaCompare(a?.name, b?.name))
    : []

  function clearDeckSelection() {
    setSelectedDecklistId(null)
    setCards([])
    setCardTypes({})
    setCardColorIdentities({})
    setCardLegalities({})
    setDeckName('')
  }

  function clearMetagameSelection() {
    setSelectedMetagameId(null)
  }

  function loadDecklist(id, options = {}) {
    const { allowIllegal = false } = options
    const list = decklists.find((d) => d.id === id)
    if (!list) return
    if (!allowIllegal) {
      const leg = getDeckLegality(list)
      if (leg.isRelevant && leg.hasIssue) return
    }
    setSelectedFormat(list.format || '')
    setSelectedDecklistId(id)
    setCards(normalizeDeckCards(list.cards))
    setCardTypes(list.cardTypes || {})
    setCardColorIdentities(list.colorIdentities || {})
    setCardLegalities(list.cardLegalities || {})
    setDeckName(list.name)
    setDeckFormat(list.format || formats[0] || DEFAULT_FORMATS[0])
    const currentMeta = metagames.find((m) => m.id === selectedMetagameId)
    if (currentMeta && !formatsMatch(currentMeta.format, list.format)) {
      clearMetagameSelection()
    }
  }

  function loadMetagame(id) {
    const meta = metagames.find((m) => m.id === id)
    if (!meta) return
    setSelectedMetagameId(id)
  }

  useEffect(() => {
    if (!selectedFormat) {
      clearDeckSelection()
      clearMetagameSelection()
      return
    }
    if (selectedDecklist && !formatsMatch(selectedDecklist.format, selectedFormat)) {
      clearDeckSelection()
      clearMetagameSelection()
      return
    }
    if (selectedMetagame && !formatsMatch(selectedMetagame.format, selectedFormat)) {
      clearMetagameSelection()
    }
  }, [selectedFormat, selectedDecklist, selectedMetagame])

  useEffect(() => {
    if (!selectedDecklistId || !selectedDecklist) return
    // Deck editor must allow loading illegal decks to fix them; don't clear selection there.
    if (manageView === 'deck-editor') return
    const leg = getDeckLegality(selectedDecklist)
    if (leg.isRelevant && leg.hasIssue) {
      clearDeckSelection()
      clearMetagameSelection()
    }
  }, [selectedDecklistId, selectedDecklist, decklists, manageView])

  useEffect(() => {
    if (!pairSelected || !userId) {
      matchupHydratedPairKeyRef.current = ''
      return
    }
    const deckMemoryKey = `${userId}:${selectedDecklist?.format || ''}:${selectedDecklist?.name || ''}`
    const data = getMatchupData(userId, selectedDecklist, selectedMetagameId)

    if (matchupHydratedPairKeyRef.current !== deckMemoryKey) {
      matchupHydratedPairKeyRef.current = deckMemoryKey
      const { next } = migrateLegacyUnifiedToPlayDraw(data.matchupValues, archetypes, safeCards)
      setMatchupValues(next)
      setKeysToMatchup(data.keysToMatchup ?? {})
      return
    }

    setMatchupValues((prev) => {
      const { next, changed } = migrateLegacyUnifiedToPlayDraw(prev, archetypes, safeCards)
      return changed ? next : prev
    })
  }, [userId, selectedDecklist, selectedMetagameId, pairSelected, archetypes, safeCards])

  const saveMatchupDataForPair = useCallback(() => {
    if (!userId || !selectedDecklistId || !selectedMetagameId) return
    saveMatchupData(userId, selectedDecklist, {
      matchupValues,
      keysToMatchup,
    })
  }, [userId, selectedDecklistId, selectedMetagameId, selectedDecklist, matchupValues, keysToMatchup])

  useEffect(() => {
    if (!pairSelected) return
    saveMatchupDataForPair()
  }, [pairSelected, saveMatchupDataForPair])

  useEffect(() => {
    if (safeCards.length === 0) return
    const names = [...new Set(safeCards.map((c) => c?.name).filter(Boolean))]
    const toFetch = names.filter((name) => !cardTypes[name] || !cardColorIdentities[name] || !cardLegalities[name])
    if (toFetch.length === 0) return
    let cancelled = false
    fetchCardMetadata(toFetch, (name, meta) => {
      if (cancelled) return
      setCardTypes((prev) => {
        const typeLine = meta?.type_line ?? undefined
        if (prev[name] === typeLine) return prev
        const next = { ...prev }
        if (typeLine != null) next[name] = typeLine
        return next
      })
      setCardColorIdentities((prev) => {
        const identity = Array.isArray(meta?.color_identity) ? meta.color_identity : []
        const prevIdentity = prev[name]
        const unchanged = Array.isArray(prevIdentity)
          && prevIdentity.length === identity.length
          && prevIdentity.every((c, i) => c === identity[i])
        if (unchanged) return prev
        return { ...prev, [name]: identity }
      })
      setCardLegalities((prev) => {
        const legalities = meta?.legalities && typeof meta.legalities === 'object' ? meta.legalities : {}
        const prevLegalities = prev[name]
        const same = JSON.stringify(prevLegalities || {}) === JSON.stringify(legalities)
        if (same) return prev
        return { ...prev, [name]: legalities }
      })
    })
    return () => { cancelled = true }
  }, [safeCards, cardTypes, cardColorIdentities, cardLegalities])

  useEffect(() => {
    if (manageView !== 'deck-editor') {
      setDeckEditorNameEditing(false)
      setDeckEditorFormatEditing(false)
      deckEditorBaselineRef.current = null
      return
    }
    const frame = requestAnimationFrame(() => {
      deckEditorBaselineRef.current = deckEditorSnapshot(deckName, deckFormat, safeCards)
    })
    return () => cancelAnimationFrame(frame)
  }, [manageView, selectedDecklistId, deckEditorMode, deckName, deckFormat, safeCards])

  const deckEditorIsDirty =
    manageView === 'deck-editor'
    && deckEditorBaselineRef.current != null
    && deckEditorSnapshot(deckName, deckFormat, safeCards) !== deckEditorBaselineRef.current
  const deckEditorCanSaveChanges = Boolean(deckName.trim()) && deckEditorIsDirty

  /** Legality of the last saved deck (storage); updates after Save. Not live while editing. */
  const deckEditorLegalityDisplay = selectedDecklist ? getDeckLegality(selectedDecklist) : null

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
    const wasNew = !selectedDecklistId
    const id = selectedDecklistId || generateId()
    saveDecklist(userId, {
      id,
      name,
      format: deckFormat,
      cards: [...safeCards],
      cardTypes: { ...cardTypes },
      colorIdentities: { ...cardColorIdentities },
      cardLegalities: { ...cardLegalities },
    })
    setDecklists(getDecklists(userId))
    setSelectedDecklistId(id)
    if (wasNew) setDeckEditorMode('edit')
  }

  function handleDeleteDecklist(id) {
    if (!userId) return
    deleteDecklist(userId, id)
    setDecklists(getDecklists(userId))
    if (selectedDecklistId === id) clearDeckSelection()
  }

  function startCreateDeck() {
    clearDeckSelection()
    setDeckEditorMode('create')
    setDeckName('')
    setDeckFormat(formats[0] || DEFAULT_FORMATS[0])
    setDeckSearchResults([])
    setDeckSearchQuery('')
    setManageView('deck-editor')
  }

  function startImportDeck() {
    clearDeckSelection()
    setDeckEditorMode('import')
    setDeckName('')
    setDeckFormat(formats[0] || DEFAULT_FORMATS[0])
    setDeckSearchResults([])
    setDeckSearchQuery('')
  }

  function startEditDeck(id) {
    loadDecklist(id, { allowIllegal: true })
    setDeckEditorMode('edit')
    setDeckSearchResults([])
    setDeckSearchQuery('')
    setManageView('deck-editor')
  }

  function incrementDeckCardQuantity(cardId, delta) {
    setCards((prev) => prev
      .map((card) => {
        if (card.id !== cardId) return card
        const qty = Number(card.quantity) || 0
        return { ...card, quantity: qty + delta }
      })
      .filter((card) => (Number(card.quantity) || 0) > 0))
  }

  function moveOneCopyToSideboard(cardId) {
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.id === cardId)
      if (idx < 0) return prev
      const card = prev[idx]
      if (card.zone === 'sideboard') return prev
      const qty = Number(card.quantity) || 0
      if (qty < 1) return prev
      const name = String(card.name || '').trim()
      if (!name) return prev

      let next = prev.map((c) => {
        if (c.id !== cardId) return c
        return { ...c, quantity: qty - 1 }
      }).filter((c) => (Number(c.quantity) || 0) > 0)

      const sbIdx = next.findIndex((c) => c.name === name && c.zone === 'sideboard')
      if (sbIdx >= 0) {
        const sb = next[sbIdx]
        next = [...next]
        next[sbIdx] = { ...sb, quantity: (Number(sb.quantity) || 0) + 1 }
      } else {
        next = [...next, { id: generateId(), name, quantity: 1, zone: 'sideboard' }]
      }
      return next
    })
  }

  function moveOneCopyToMain(cardId) {
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.id === cardId)
      if (idx < 0) return prev
      const card = prev[idx]
      if (card.zone !== 'sideboard') return prev
      const qty = Number(card.quantity) || 0
      if (qty < 1) return prev
      const name = String(card.name || '').trim()
      if (!name) return prev

      let next = prev
        .map((c) => (c.id === cardId ? { ...c, quantity: qty - 1 } : c))
        .filter((c) => (Number(c.quantity) || 0) > 0)

      const mainIdx = next.findIndex((c) => c.name === name && c.zone !== 'sideboard')
      if (mainIdx >= 0) {
        const main = next[mainIdx]
        next = [...next]
        next[mainIdx] = { ...main, quantity: (Number(main.quantity) || 0) + 1 }
      } else {
        next = [...next, { id: generateId(), name, quantity: 1, zone: 'main' }]
      }
      return next
    })
  }

  function addCardToDeck(name, zone) {
    const cardName = String(name || '').trim()
    if (!cardName) return
    setCards((prev) => {
      const idx = prev.findIndex((card) => card.name === cardName && (card.zone === 'sideboard') === (zone === 'sideboard'))
      if (idx >= 0) {
        const next = [...prev]
        const qty = Number(next[idx].quantity) || 0
        next[idx] = { ...next[idx], quantity: qty + 1 }
        return next
      }
      return [...prev, { id: generateId(), name: cardName, quantity: 1, zone }]
    })
  }

  async function handleDeckSearch() {
    const query = deckSearchQuery.trim()
    if (!query) {
      setDeckSearchResults([])
      return
    }
    setDeckSearchLoading(true)
    const results = await searchCardsByName(query)
    setDeckSearchResults(results)
    setDeckSearchLoading(false)
  }

  async function ensureDeckCardPreview(cardName) {
    const name = String(cardName || '').trim()
    if (!name) return
    if (deckCardPreviewUrls[name] !== undefined) return
    const imageUrl = await fetchCardImageUrlByName(name)
    setDeckCardPreviewUrls((prev) => ({ ...prev, [name]: imageUrl }))
  }

  function handleMatchupCardHover(cardName, e) {
    const name = String(cardName || '').trim()
    if (!name) return
    setActivePreviewCardName(name)
    const x = e?.clientX
    const y = e?.clientY
    if (typeof x === 'number' && typeof y === 'number') {
      setMatchupPreviewPoint({ x, y })
    }
    void ensureDeckCardPreview(name)
  }

  function handleMatchupCardMove(e) {
    const x = e?.clientX
    const y = e?.clientY
    if (typeof x === 'number' && typeof y === 'number') {
      setMatchupPreviewPoint({ x, y })
    }
  }

  function handleMatchupCardLeave() {
    setActivePreviewCardName('')
    setMatchupPreviewPoint(null)
  }

  function handleAddFormat() {
    const name = newFormatName.trim()
    if (!name || !userId) return
    if (formats.some((f) => f.toLowerCase() === name.toLowerCase())) return
    const nextFormats = [...formats, name]
    setFormats(nextFormats)
    saveFormats(userId, nextFormats)
    setDeckFormat(name)
    setManageMetaFormat(name)
    setSelectedFormat(name)
    setNewFormatName('')
  }

  function handleRemoveFormat(name) {
    if (!userId) return
    if (DEFAULT_FORMATS.includes(name)) return
    const nextFormats = formats.filter((f) => f !== name)
    if (nextFormats.length === 0) return
    setFormats(nextFormats)
    saveFormats(userId, nextFormats)
    if (selectedFormat === name) setSelectedFormat('')
    if (deckFormat === name) setDeckFormat(nextFormats[0] || DEFAULT_FORMATS[0])
    if (manageMetaFormat === name) setManageMetaFormat(nextFormats[0] || DEFAULT_FORMATS[0])
  }

  function runThemedPrint(mode) {
    if (nextPrintRequirement) {
      window.alert(`You cannot print yet. ${nextPrintRequirement}`)
      return
    }
    const body = document.body
    body.classList.add(`print-mode-${mode}`)
    setPrintPageLayout(mode)
    const cleanup = () => {
      body.classList.remove(`print-mode-${mode}`)
      setPrintPageLayout(null)
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print()
      })
    })
    window.setTimeout(cleanup, 2500)
  }

  async function handleDecklistOrg() {
    if (nextPrintRequirement) {
      window.alert(`You cannot do this yet. ${nextPrintRequirement}`)
      return
    }
    const result = await copyDeckAndOpenDecklistOrg(safeCards)
    if (result === 'empty') {
      window.alert('This decklist has no cards to copy.')
      return
    }
    if (result === 'clipboard-failed') {
      window.alert(
        'Could not copy to the clipboard. Allow clipboard access for this site, or copy your deck from the deck editor manually.'
      )
      return
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <button type="button" className="app-header-logo-btn" onClick={onGoHome} aria-label="Go to home">
          <img src={logo} alt="" className="app-header-logo" />
        </button>
        <div className="app-header-auth">
          <span className="header-user">Signed in as {user?.email}</span>
          <button
            type="button"
            className="btn-reset"
            onClick={() => {
              logout()
              onGoHome?.()
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <DashboardErrorBoundary>
      <main className="main-content">
        {!manageView && (
          <div className="top-controls">
            <div className="top-choice-sections">
              <section className="section section-compact section-step format-section">
                <h2 className="step-title">Step 1: Select a Format</h2>
                <div className="crud-row">
                  <label className="crud-label">
                    Format
                    <select
                      value={selectedFormat}
                      onChange={(e) => setSelectedFormat(e.target.value)}
                      className="crud-select"
                    >
                      <option value="">—</option>
                      {sortedFormats.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="btn-add-new btn-in-step"
                  onClick={() => setManageView('formats')}
                >
                  Add or remove formats
                </button>
              </section>
              <section className={`section section-compact section-step deck-section ${isStep2Locked ? 'step-locked' : 'step-ready'}`}>
                <h2 className="step-title">Step 2: Select Decklist</h2>
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
                      disabled={!selectedFormat}
                    >
                      <option value="">{selectedFormat ? '—' : 'Select format first'}</option>
                      {decklistsForFormat.map((d) => {
                        const leg = getDeckLegality(d)
                        const blocked = leg.isRelevant && leg.hasIssue
                        return (
                          <option key={d.id} value={d.id} disabled={blocked}>
                            {d.name} ({d.format})
                            {blocked ? ' — legality issues' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="btn-add-new btn-in-step"
                  onClick={() => setManageView('decklists')}
                  disabled={isStep2Locked}
                >
                  Add or modify decklists
                </button>
              </section>
              <section className={`section section-compact section-step metagame-section ${isStep3Locked ? 'step-locked' : 'step-ready'}`}>
                <h2 className="step-title">Step 3: Select a Metagame</h2>
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
                <button
                  type="button"
                  className="btn-add-new btn-in-step"
                  onClick={() => {
                    setManageMetaFormat(selectedFormat || formats[0] || DEFAULT_FORMATS[0])
                    setManageView('metagames')
                  }}
                  disabled={isStep3Locked}
                >
                  Add or modify metagames
                </button>
              </section>
            </div>
          </div>
        )}
        {manageView === 'formats' && (
          <div className="manage-view">
            <div className="manage-view-header">
              <button type="button" className="btn-back" onClick={() => setManageView(null)}>
                ← Back
              </button>
              <h2 className="manage-view-title">Add or remove formats</h2>
            </div>
            <div className="manage-view-content">
              <section className="section section-compact">
                <h2>Formats</h2>
                <p className="crud-list-label">Default formats cannot be removed.</p>
                <ul className="saved-list">
                  {sortedFormats.map((formatName) => (
                    <li key={formatName} className="saved-item">
                      <span>{formatName}</span>
                      <div>
                        {!DEFAULT_FORMATS.includes(formatName) && (
                          <button
                            type="button"
                            className="btn-small btn-danger"
                            onClick={() => handleRemoveFormat(formatName)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="crud-row crud-actions">
                  <input
                    type="text"
                    value={newFormatName}
                    onChange={(e) => setNewFormatName(e.target.value)}
                    placeholder="New format name"
                    className="crud-input"
                  />
                  <button type="button" className="btn-save" onClick={handleAddFormat}>
                    Add format
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}
        {manageView === 'decklists' && (
          <div className="manage-view">
            <div className="manage-view-header">
              <button type="button" className="btn-back" onClick={() => setManageView(null)}>
                ← Back
              </button>
              <h2 className="manage-view-title">Your Decks</h2>
            </div>
            <div className="manage-view-content manage-view-content-wide">
              <section className="section deck-section deck-section-editor">
                <div className="decklist-actions-top">
                  <button type="button" className="btn-add-new" onClick={startImportDeck}>
                    Import Deck (recommended)
                  </button>
                  <button type="button" className="btn-add-new" onClick={startCreateDeck}>
                    Create Deck from Scratch
                  </button>
                </div>

                <div className="decklist-filter-row">
                  <label className="crud-label decklist-format-filter-label">
                    Format
                    <select
                      value={manageDecklistFormatFilter}
                      onChange={(e) => setManageDecklistFormatFilter(e.target.value)}
                      className="crud-select decklist-format-filter-select"
                    >
                      <option value="">All formats</option>
                      {sortedFormats.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="decklist-table-wrap">
                  <table className="decklist-table">
                    <thead>
                      <tr>
                        <th>Deck Name</th>
                        <th>Format</th>
                        <th>Colors</th>
                        <th>Last Modified</th>
                        <th className="decklist-th-legality">
                          <span className="decklist-th-legality-inner">
                            <span className="decklist-th-legality-label">Legality Check</span>
                            <span
                              className="decklist-legality-help"
                              tabIndex={0}
                              aria-label="About legality checks"
                            >
                              <span className="decklist-legality-help-trigger">?</span>
                              <span className="decklist-legality-help-tooltip" role="tooltip">
                                Legality is currently only checked for Standard, Pioneer, Modern, and Legacy
                              </span>
                            </span>
                          </span>
                        </th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decklists.length === 0 && (
                        <tr>
                          <td colSpan={6} className="decklist-table-empty">No decklists yet.</td>
                        </tr>
                      )}
                      {decklists.length > 0 && sortedDecklistsForTable.length === 0 && (
                        <tr>
                          <td colSpan={6} className="decklist-table-empty">No decklists match this format.</td>
                        </tr>
                      )}
                      {sortedDecklistsForTable.map((d) => {
                        const colors = getDeckColorIdentity(d)
                        const legality = getDeckLegality(d)
                        const rowIllegal = legality.isRelevant && legality.hasIssue
                        return (
                          <tr key={d.id} className={rowIllegal ? 'decklist-row-illegal' : undefined}>
                            <td>{d.name}</td>
                            <td>{d.format || '—'}</td>
                            <td>
                              <div className="deck-colors">
                                {colors.length === 0 ? (
                                  <span className="deck-colors-none">—</span>
                                ) : (
                                  colors.map((c) => (
                                    <img key={c} src={COLOR_SYMBOL_URLS[c]} alt={c} className="mana-icon" />
                                  ))
                                )}
                              </div>
                            </td>
                            <td>{formatTimestamp(d.updatedAt)}</td>
                            <td>
                              {legality.isRelevant ? (
                                legality.hasIssue ? (
                                  <div className="deck-legality-icons" aria-label="Deck legality warnings">
                                    {legality.issues.map((issue) => (
                                      <span
                                        key={issue.code}
                                        className="deck-legality-warning"
                                        tabIndex={0}
                                        aria-label={issue.message}
                                      >
                                        {issue.icon}
                                        <span className="deck-legality-tooltip" role="tooltip">
                                          {issue.message}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="deck-legality-ok" title="Deck passes legality checks">✓</span>
                                )
                              ) : (
                                <span className="deck-legality-na" title="Legality checks apply to Standard, Pioneer, Modern, Legacy">—</span>
                              )}
                            </td>
                            <td>
                              <button type="button" className="btn-small" onClick={() => startEditDeck(d.id)}>Edit</button>
                              <button type="button" className="btn-small btn-danger" onClick={() => handleDeleteDecklist(d.id)}>Delete</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <DeckEditorErrorBoundary>
                  {deckEditorMode === 'import' && (
                    <div className="deck-editor-panel">
                      <h3 className="deck-editor-title">
                        Import Deck (recommended)
                      </h3>
                      <DeckUpload
                        onCardsParsed={(c, meta) => {
                          setCards(c)
                          setSelectedDecklistId(null)
                          if (meta?.defaultDeckName) setDeckName(meta.defaultDeckName)
                        }}
                      />
                    <div className="crud-row crud-actions">
                      <input
                        type="text"
                        value={deckName}
                        onChange={(e) => setDeckName(e.target.value)}
                        placeholder="Deck name"
                        className="crud-input"
                      />
                      <select value={deckFormat} onChange={(e) => setDeckFormat(e.target.value)} className="crud-select narrow">
                        {sortedFormats.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                      <button type="button" className="btn-save" onClick={handleSaveDecklist}>
                        Save deck
                      </button>
                    </div>
                    </div>
                  )}
                </DeckEditorErrorBoundary>
              </section>
            </div>
          </div>
        )}
        {manageView === 'deck-editor' && (
          <div className="manage-view">
            <div className="manage-view-header manage-view-header-deck-editor">
              <div className="manage-view-header-start">
                <button type="button" className="btn-back" onClick={() => setManageView('decklists')}>
                  ← Back to decklists
                </button>
                <button
                  type="button"
                  className={`btn-save deck-editor-save-btn${deckEditorIsDirty ? ' deck-editor-save-btn--dirty' : ''}`}
                  onClick={handleSaveDecklist}
                >
                  {!selectedDecklistId ? 'Save deck' : 'Save Changes'}
                </button>
              </div>
              <h2 className="manage-view-title manage-view-title-deck-editor">
                {deckEditorMode === 'create' ? 'Create Deck from Scratch' : 'Deck Editor'}
              </h2>
              <div className="manage-view-header-legality">
                <div className="deck-editor-legality-panel">
                  <div className="deck-editor-legality-panel-title">Legality</div>
                  {!selectedDecklistId ? (
                    <p className="deck-editor-legality-placeholder">Save your deck to see legality results.</p>
                  ) : !deckEditorLegalityDisplay ? (
                    <p className="deck-editor-legality-placeholder">—</p>
                  ) : !deckEditorLegalityDisplay.isRelevant ? (
                    <p className="deck-editor-legality-na">
                      Legality checks apply to Standard, Pioneer, Modern, and Legacy.
                    </p>
                  ) : deckEditorLegalityDisplay.hasIssue ? (
                    <ul className="deck-editor-legality-issues">
                      {deckEditorLegalityDisplay.issues.map((issue) => (
                        <li key={issue.code}>
                          <span className="deck-editor-legality-issue-icon" aria-hidden="true">{issue.icon}</span>
                          <span>{issue.message}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="deck-editor-legality-ok">All checks passed for this format.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="manage-view-content manage-view-content-wide">
              <section className="section deck-section">
                <DeckEditorErrorBoundary>
                  {selectedDecklist || deckEditorMode === 'create' ? (
                    <div className="deck-editor-panel">
                      <div className="deck-editor-deck-meta">
                        <div className="deck-editor-deck-meta-item">
                          <span className="deck-editor-deck-meta-label">Deck Name</span>
                          {deckEditorNameEditing ? (
                            <div className="deck-editor-deck-meta-edit">
                              <input
                                type="text"
                                value={deckName}
                                onChange={(e) => setDeckName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    setDeckName((n) => n.trim())
                                    setDeckEditorNameEditing(false)
                                  }
                                }}
                                className="crud-input deck-editor-deck-meta-input"
                                placeholder="Deck name"
                                autoComplete="off"
                                autoFocus
                              />
                              <button
                                type="button"
                                className="btn-small"
                                onClick={() => {
                                  setDeckName((n) => n.trim())
                                  setDeckEditorNameEditing(false)
                                }}
                              >
                                Done
                              </button>
                            </div>
                          ) : (
                            <div className="deck-editor-deck-meta-value-row">
                              <span className="deck-editor-deck-meta-value">{(selectedDecklist?.name ?? deckName).trim() || '—'}</span>
                              <button
                                type="button"
                                className="btn-small"
                                onClick={() => {
                                  setDeckEditorFormatEditing(false)
                                  setDeckEditorNameEditing(true)
                                }}
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="deck-editor-deck-meta-item">
                          <span className="deck-editor-deck-meta-label">Format</span>
                          {deckEditorFormatEditing ? (
                            <div className="deck-editor-deck-meta-edit">
                              <select
                                value={deckFormat}
                                onChange={(e) => setDeckFormat(e.target.value)}
                                className="crud-select narrow deck-editor-deck-meta-select"
                              >
                                {sortedFormats.map((f) => (
                                  <option key={f} value={f}>{f}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="btn-small"
                                onClick={() => setDeckEditorFormatEditing(false)}
                              >
                                Done
                              </button>
                            </div>
                          ) : (
                            <div className="deck-editor-deck-meta-value-row">
                              <span className="deck-editor-deck-meta-value">{selectedDecklist?.format ?? deckFormat ?? '—'}</span>
                              <button
                                type="button"
                                className="btn-small"
                                onClick={() => {
                                  setDeckEditorNameEditing(false)
                                  setDeckEditorFormatEditing(true)
                                }}
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="deck-edit-layout deck-edit-layout-condensed">
                        <aside className="deck-preview-panel">
                          <div className="deck-preview-title">Card Preview</div>
                          {activePreviewCardName ? (
                            <>
                              <div className="deck-preview-name">{activePreviewCardName}</div>
                              {deckCardPreviewUrls[activePreviewCardName] ? (
                                <img
                                  src={deckCardPreviewUrls[activePreviewCardName]}
                                  alt={`${activePreviewCardName} preview`}
                                  className="deck-preview-image-fixed"
                                />
                              ) : deckCardPreviewUrls[activePreviewCardName] === null ? (
                                <div className="deck-edit-card-status">Preview unavailable.</div>
                              ) : (
                                <div className="deck-edit-card-status">Loading preview...</div>
                              )}
                            </>
                          ) : (
                            <div className="deck-edit-card-status">Hover a card name to preview it.</div>
                          )}
                        </aside>

                        <div className="deck-cards-panel">
                          <div className="deck-edit-deck-columns">
                            <div className="deck-edit-main-column">
                              <h4 className="deck-subtitle">Main deck ({mainDeckTotalCards})</h4>
                              <div className="deck-edit-blocks deck-edit-blocks-main">
                                {deckEditorBlockGroups.filter((g) => g.key !== 'side').map((group) => {
                                  const groupTotal = group.cards.reduce((sum, card) => sum + (Number(card.quantity) || 0), 0)
                                  return (
                                    <div key={group.key} className="deck-edit-block">
                                      <div className="deck-edit-block-title">{group.title}</div>
                                      <div className="deck-edit-block-list">
                                        {group.cards.length === 0 ? (
                                          <>
                                            <div className="deck-edit-block-empty">No cards</div>
                                            <div className="deck-edit-block-list-filler" aria-hidden="true" />
                                          </>
                                        ) : (
                                          <>
                                            <div className="deck-edit-block-rows">
                                              {group.cards.map((card) => (
                                                <div key={card.id} className="deck-edit-block-row">
                                                  <span className="deck-edit-block-row-trailing-spacer" aria-hidden="true" />
                                                  <div className="deck-adjust-actions">
                                                    <button type="button" className="btn-small deck-adjust-btn deck-adjust-minus" onClick={() => incrementDeckCardQuantity(card.id, -1)}>-</button>
                                                  </div>
                                                  <span className="deck-qty-readout">{card.quantity}</span>
                                                  <div className="deck-adjust-actions">
                                                    <button type="button" className="btn-small deck-adjust-btn deck-adjust-plus" onClick={() => incrementDeckCardQuantity(card.id, 1)}>+</button>
                                                  </div>
                                                  <div className="deck-adjust-actions">
                                                    <div className="deck-move-tooltip-wrap">
                                                      <button
                                                        type="button"
                                                        className="btn-small deck-adjust-btn deck-adjust-to-sideboard"
                                                        aria-label={`Move one copy of ${card.name} to sideboard`}
                                                        onClick={() => moveOneCopyToSideboard(card.id)}
                                                      >
                                                        &gt;
                                                      </button>
                                                      <div className="deck-move-tooltip-panel" role="tooltip">
                                                        Move one copy from your main deck to the sideboard.
                                                      </div>
                                                    </div>
                                                  </div>
                                                  <span
                                                    className="deck-edit-card-name-btn"
                                                    onMouseEnter={() => {
                                                      setActivePreviewCardName(card.name)
                                                      ensureDeckCardPreview(card.name)
                                                    }}
                                                  >
                                                    {card.name}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                            <div className="deck-edit-block-list-filler" aria-hidden="true" />
                                          </>
                                        )}
                                      </div>
                                      <div className="deck-edit-block-total">
                                        <span className="deck-edit-block-row-trailing-spacer" aria-hidden="true" />
                                        <span aria-hidden="true" />
                                        <span className="deck-edit-block-total-value">{groupTotal}</span>
                                        <span aria-hidden="true" />
                                        <span aria-hidden="true" />
                                        <span className="deck-edit-block-total-label">Total</span>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                            <div className="deck-edit-side-column">
                              <h4 className="deck-subtitle">Sideboard ({sideboardTotalCards})</h4>
                              <div className="deck-edit-blocks deck-edit-blocks-side">
                                {deckEditorBlockGroups.filter((g) => g.key === 'side').map((group) => {
                                  const groupTotal = group.cards.reduce((sum, card) => sum + (Number(card.quantity) || 0), 0)
                                  return (
                                    <div key={group.key} className="deck-edit-block deck-edit-block-sideboard">
                                      <div className="deck-edit-block-title">{group.title}</div>
                                      <div className="deck-edit-block-list">
                                        {group.cards.length === 0 ? (
                                          <>
                                            <div className="deck-edit-block-empty">No cards</div>
                                            <div className="deck-edit-block-list-filler" aria-hidden="true" />
                                          </>
                                        ) : (
                                          <>
                                            <div className="deck-edit-block-rows">
                                              {group.cards.map((card) => (
                                                <div key={card.id} className="deck-edit-block-row">
                                                  <div className="deck-adjust-actions">
                                                    <div className="deck-move-tooltip-wrap">
                                                      <button
                                                        type="button"
                                                        className="btn-small deck-adjust-btn deck-adjust-from-sideboard"
                                                        aria-label={`Move one copy of ${card.name} to main deck`}
                                                        onClick={() => moveOneCopyToMain(card.id)}
                                                      >
                                                        &lt;
                                                      </button>
                                                      <div className="deck-move-tooltip-panel" role="tooltip">
                                                        Move one copy from your sideboard to the main deck.
                                                      </div>
                                                    </div>
                                                  </div>
                                                  <div className="deck-adjust-actions">
                                                    <button type="button" className="btn-small deck-adjust-btn deck-adjust-minus" onClick={() => incrementDeckCardQuantity(card.id, -1)}>-</button>
                                                  </div>
                                                  <span className="deck-qty-readout">{card.quantity}</span>
                                                  <div className="deck-adjust-actions">
                                                    <button type="button" className="btn-small deck-adjust-btn deck-adjust-plus" onClick={() => incrementDeckCardQuantity(card.id, 1)}>+</button>
                                                  </div>
                                                  <span className="deck-edit-block-row-trailing-spacer" aria-hidden="true" />
                                                  <span
                                                    className="deck-edit-card-name-btn"
                                                    onMouseEnter={() => {
                                                      setActivePreviewCardName(card.name)
                                                      ensureDeckCardPreview(card.name)
                                                    }}
                                                  >
                                                    {card.name}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                            <div className="deck-edit-block-list-filler" aria-hidden="true" />
                                          </>
                                        )}
                                      </div>
                                      <div className="deck-edit-block-total">
                                        <span className="deck-edit-block-row-trailing-spacer" aria-hidden="true" />
                                        <span aria-hidden="true" />
                                        <span className="deck-edit-block-total-value">{groupTotal}</span>
                                        <span aria-hidden="true" />
                                        <span aria-hidden="true" />
                                        <span className="deck-edit-block-total-label">Total</span>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              <div className="deck-add-cards-section">
                                <div className="deck-add-cards-row">
                                  <h4 className="deck-add-cards-title">Add new cards:</h4>
                                  <form
                                    className="crud-row crud-actions deck-search-form deck-add-cards-form"
                                    onSubmit={(e) => {
                                      e.preventDefault()
                                      handleDeckSearch()
                                    }}
                                  >
                                    <input
                                      type="search"
                                      name="deck-scryfall-search"
                                      value={deckSearchQuery}
                                      onChange={(e) => {
                                        const v = e.target.value
                                        setDeckSearchQuery(v)
                                        if (!v.trim()) {
                                          setDeckSearchResults([])
                                          setDeckSearchLoading(false)
                                        }
                                      }}
                                      placeholder="Search Scryfall cards"
                                      className="crud-input"
                                      autoComplete="off"
                                      enterKeyHint="search"
                                    />
                                    <button type="submit" className="btn-save">
                                      Search
                                    </button>
                                  </form>
                                </div>
                                <div className="deck-search-results">
                                  {deckSearchLoading && <p className="placeholder">Searching cards...</p>}
                                  {!deckSearchLoading && deckSearchResults.map((card) => (
                                    <div
                                      key={card.id}
                                      className="deck-search-item"
                                      onMouseEnter={() => {
                                        setActivePreviewCardName(card.name)
                                        ensureDeckCardPreview(card.name)
                                      }}
                                    >
                                      <div>
                                        <div className="deck-search-name">{card.name}</div>
                                        <div className="deck-search-type">{card.type_line || '—'}</div>
                                      </div>
                                      <div className="deck-search-actions">
                                        <button type="button" className="btn-small deck-adjust-btn deck-adjust-plus" onClick={() => addCardToDeck(card.name, 'main')}>
                                          +1 main
                                        </button>
                                        <button type="button" className="btn-small deck-adjust-btn deck-adjust-plus" onClick={() => addCardToDeck(card.name, 'sideboard')}>
                                          +1 side
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="deck-editor-panel">
                      <p className="placeholder">Select a valid deck from the decklist table.</p>
                    </div>
                  )}
                </DeckEditorErrorBoundary>
              </section>
            </div>
          </div>
        )}
        {manageView === 'metagames' && (
          <div className="manage-view manage-view--metagames">
            <div className="manage-view-header">
              <button type="button" className="btn-back" onClick={() => setManageView(null)}>
                ← Back
              </button>
              <h2 className="manage-view-title">Define the Metagame</h2>
            </div>
            <div className="manage-view-content manage-view-content-wide">
              <section className="section section-compact metagame-section section-metagame-grid">
                <div className="metagame-page-layout">
                  <aside className="metagame-page-sidebar">
                    <div className="crud-row metagame-format-row">
                      <label className="crud-label">
                        Format
                        <select
                          value={formats.includes(manageMetaFormat) ? manageMetaFormat : formats[0] || ''}
                          onChange={(e) => setManageMetaFormat(e.target.value)}
                          className="crud-select"
                        >
                          {sortedFormats.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="metagame-sources-card" aria-label="Helpful metagame sources">
                      <h3 className="metagame-sources-title">Helpful metagame sources</h3>
                      <ul className="metagame-sources-list">
                        <li>
                          <a
                            href="https://www.mtggoldfish.com/metagame/standard#paper"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            MTG Goldfish
                          </a>
                        </li>
                        <li>
                          <a
                            href="https://j6e.me/mtg-meta-analyzer/archetypes"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            MTG Meta Analyzer
                          </a>
                        </li>
                        <li>
                          <a
                            href="https://mtgdecks.net"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            MTGDecks.net
                          </a>
                        </li>
                      </ul>
                    </div>
                  </aside>
                  <div className="metagame-page-main">
                    <MetagameGridEditor
                      key={`${userId}-${manageMetaFormat}`}
                      userId={userId}
                      format={formats.includes(manageMetaFormat) ? manageMetaFormat : formats[0]}
                      onSynced={refreshMetagames}
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {!manageView && pairSelected && (
          <>
            <section className="section matchup-table">
              <div className="matchup-print-banner">
                {selectedDecklist?.name ?? '—'} vs. {selectedMetagame?.name ?? '—'}
              </div>
              <div className="section-actions section-actions--matchup-step4">
                <div className="matchup-step4-top">
                  <div className="matchup-step4-heading">
                    <h2 className="step3-title">
                      Step 4: Create Your Sideboard Plan
                      <br />
                      <span className="step3-line-normal step3-line-deck-meta">
                        <span className="step3-deck-line">{selectedDecklist?.name}</span>
                        <span className="step3-vs-line">vs. {selectedMetagame?.name}</span>
                      </span>
                    </h2>
                  </div>
                  <div className="matchup-step4-right" role="group" aria-label="Matchup table tools">
                    <div className="matchup-toolbar-group matchup-toolbar-group--formatting">
                      <div className="matchup-toolbar-group-title">Formatting</div>
                      <div className="matchup-toolbar-group-actions matchup-toolbar-group-actions--formatting">
                        <label className="toggle-hide-lands matchup-toolbar-control">
                          <input type="checkbox" checked={hideLands} onChange={(e) => setHideLands(e.target.checked)} />
                          <span className="toggle-hide-lands-label">Hide lands</span>
                        </label>
                        <label className="matchup-display-count-label matchup-toolbar-control">
                          Show decks
                          <select
                            className="crud-select narrow"
                            value={matchupDisplayCount}
                            onChange={(e) => setMatchupDisplayCount(e.target.value)}
                          >
                            <option value="5">Top 5</option>
                            <option value="10">Top 10</option>
                            <option value="all">All</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="btn-reset matchup-toolbar-btn"
                          onClick={() => setResetMatchupModalOpen(true)}
                          title="Clear all matchup cell values"
                        >
                          Reset matchup values
                        </button>
                      </div>
                    </div>
                    <div className="matchup-toolbar-group matchup-toolbar-group--exports">
                      <div className="matchup-toolbar-group-title">Exports</div>
                      <div className="matchup-toolbar-group-actions">
                        <button
                          type="button"
                          className={`btn-print btn-print-step matchup-toolbar-btn ${nextPrintRequirement ? 'btn-print-disabled' : ''}`}
                          disabled={Boolean(nextPrintRequirement)}
                          onClick={() => void handleDecklistOrg()}
                          title={
                            nextPrintRequirement ||
                            'Copy main deck + sideboard as plain text, then open decklist.org to paste and print your registration sheet'
                          }
                        >
                          Copy deck &amp; open decklist.org
                        </button>
                        <button
                          type="button"
                          className={`btn-print btn-print-step matchup-toolbar-btn ${nextPrintRequirement ? 'btn-print-disabled' : ''}`}
                          disabled={Boolean(nextPrintRequirement)}
                          onClick={() => runThemedPrint('matrix')}
                          title={nextPrintRequirement || 'Print matchup matrix landscape (PDF)'}
                        >
                          Print matchup matrix
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {resetMatchupModalOpen ? (
                <div
                  className="matchup-reset-modal-backdrop"
                  role="presentation"
                  onClick={() => setResetMatchupModalOpen(false)}
                >
                  <div
                    className="matchup-reset-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="matchup-reset-modal-title"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 id="matchup-reset-modal-title" className="matchup-reset-modal-title">
                      Reset matchup values?
                    </h3>
                    <p className="matchup-reset-modal-body">Are you sure? This clears every cell in the matchup matrix for this deck.</p>
                    <div className="matchup-reset-modal-actions">
                      <button
                        type="button"
                        className="btn-reset matchup-reset-modal-confirm"
                        onClick={() => {
                          setMatchupValues({})
                          setResetMatchupModalOpen(false)
                        }}
                      >
                        Yes, reset
                      </button>
                      <button
                        type="button"
                        className="btn-print btn-print-step matchup-reset-modal-cancel"
                        onClick={() => setResetMatchupModalOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {typeof document !== 'undefined' &&
                matchupCursorPreviewStyle &&
                activePreviewCardName &&
                createPortal(
                  <div className="matchup-cursor-preview" style={matchupCursorPreviewStyle} role="tooltip">
                    <span className="matchup-cursor-preview-title">{activePreviewCardName}</span>
                    {deckCardPreviewUrls[activePreviewCardName] ? (
                      <img
                        src={deckCardPreviewUrls[activePreviewCardName]}
                        alt=""
                        className="matchup-cursor-preview-image"
                      />
                    ) : deckCardPreviewUrls[activePreviewCardName] === null ? (
                      <span className="matchup-cursor-preview-fallback">No preview</span>
                    ) : (
                      <span className="matchup-cursor-preview-fallback">Loading…</span>
                    )}
                  </div>,
                  document.body
                )}
              <MatchupTable
                cards={safeCards}
                archetypes={displayedArchetypes}
                values={matchupValues}
                cardTypes={cardTypes}
                hideLands={hideLands}
                onChangeCell={handleMatchupChange}
                onCardHover={handleMatchupCardHover}
                onCardMove={handleMatchupCardMove}
                onCardLeave={handleMatchupCardLeave}
              />
            </section>

            <section className="section sideboard-guide-section">
              <div className="section-actions">
                <h2 className="step5-title">
                  Step 5: Note the keys to each matchup
                  <br />
                  <span className="step5-line-normal">Deck: {selectedDecklist?.name ?? '—'}</span>
                </h2>
                <button
                  type="button"
                  className="btn-reset"
                  onClick={() => setKeysToMatchup({})}
                  title="Clear all matchup notes"
                >
                  Clear notes
                </button>
                <button
                  type="button"
                  className={`btn-print btn-print-step ${nextPrintRequirement ? 'btn-print-disabled' : ''}`}
                  disabled={Boolean(nextPrintRequirement)}
                  onClick={() => runThemedPrint('sideboard')}
                  title={nextPrintRequirement || 'Print sideboard guide (PDF, 1–3 pages)'}
                >
                  Print sideboard guide
                </button>
              </div>
              <SideboardGuide
                archetypes={sideboardGuideArchetypes}
                matchupValues={matchupValues}
                keysToMatchup={keysToMatchup}
                onKeysChange={handleKeysToMatchupChange}
                emptyMessage="No archetypes at or above 1% metagame in the current view."
              />
            </section>
          </>
        )}

      </main>
      </DashboardErrorBoundary>
    </div>
  )
}

export default function App() {
  const { user } = useAuth()
  const [appPage, setAppPage] = useState('home')

  useEffect(() => {
    if (appPage === 'app' && !user) setAppPage('home')
  }, [appPage, user])

  if (appPage === 'home') {
    return (
      <HomePage
        user={user}
        onNavigateLogin={() => setAppPage('login')}
        onNavigateApp={() => setAppPage('app')}
        onLogoClick={() => {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    )
  }

  if (appPage === 'login') {
    return (
      <Login
        onBack={() => setAppPage('home')}
        onSuccess={() => setAppPage('app')}
      />
    )
  }

  if (!user) {
    return (
      <Login
        onBack={() => setAppPage('home')}
        onSuccess={() => setAppPage('app')}
      />
    )
  }

  return <Dashboard onGoHome={() => setAppPage('home')} />
}
