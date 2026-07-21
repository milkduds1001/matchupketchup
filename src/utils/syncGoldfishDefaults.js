/**
 * Thin glue between metagameDefaults.js (fetches + normalizes MTG Goldfish archetype data)
 * and storage.js (owns each user's per-format metagame grid). This file is the entry point
 * the rest of the app calls to refresh a user's grid(s) with the latest Goldfish snapshot:
 * it fetches the payload, reshapes it per format via getDefaultsForFormat, then delegates the
 * actual merge-into-grid logic to storage.js's applyLockedGoldfishDefaults (which owns which
 * columns are "locked" to Goldfish vs user-edited) and only persists when something changed.
 */

import { fetchMetagameDefaults, getDefaultsForFormat } from './metagameDefaults.js'
import {
  ensureMetagameGrid,
  saveMetagameGrid,
  applyLockedGoldfishDefaults,
  getFormats,
} from './storage.js'

/** True if a format's reshaped payload has any archetypes at all, in the per-window snapshots or the flat list — used to skip formats Goldfish has no data for rather than blowing away an existing grid with an empty one. */
function hasSnapshotData(data) {
  if (!data?.snapshots) return false
  for (const key of ['7', '14', '30']) {
    const list = data.snapshots[key]?.archetypes
    if (Array.isArray(list) && list.length > 0) return true
  }
  return Array.isArray(data.archetypes) && data.archetypes.length > 0
}

/** Applies one format's slice of an already-fetched Goldfish payload to that format's stored grid, saving only if the merge actually changed it. Shared by both exports below so a single fetch can drive one format or all of them. */
function applyGoldfishDefaultsToFormat(userId, format, payload) {
  const grid = ensureMetagameGrid(userId, format)
  const data = getDefaultsForFormat(payload, format)
  if (!hasSnapshotData(data)) return
  const next = applyLockedGoldfishDefaults(grid, data, format)
  if (JSON.stringify(next) !== JSON.stringify(grid)) {
    saveMetagameGrid(userId, format, next)
  }
}

/**
 * Fetches MTG Goldfish defaults and applies them to one format’s grid (locked 7/14/30 columns).
 * @param {{ refresh?: boolean }} [options] — pass refresh: true to bypass server cache (same as “Refresh MTG Goldfish”).
 */
export async function syncGoldfishDefaultsForFormat(userId, format, options = {}) {
  if (!userId || !format) return
  const payload = await fetchMetagameDefaults(options)
  applyGoldfishDefaultsToFormat(userId, format, payload)
}

/**
 * One API fetch; applies Goldfish defaults to every format the user has enabled.
 */
export async function syncGoldfishDefaultsForAllFormats(userId, options = {}) {
  if (!userId) return
  const formats = getFormats(userId)
  const payload = await fetchMetagameDefaults(options)
  for (const format of formats) {
    applyGoldfishDefaultsToFormat(userId, format, payload)
  }
}
