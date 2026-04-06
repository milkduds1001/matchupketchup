import { fetchMetagameDefaults, getDefaultsForFormat } from './metagameDefaults.js'
import {
  ensureMetagameGrid,
  saveMetagameGrid,
  applyLockedGoldfishDefaults,
  getFormats,
} from './storage.js'

function hasSnapshotData(data) {
  if (!data?.snapshots) return false
  for (const key of ['7', '14', '30']) {
    const list = data.snapshots[key]?.archetypes
    if (Array.isArray(list) && list.length > 0) return true
  }
  return Array.isArray(data.archetypes) && data.archetypes.length > 0
}

/**
 * Fetches MTG Goldfish defaults and applies them to one format’s grid (locked 7/14/30 columns).
 * @param {{ refresh?: boolean }} [options] — pass refresh: true to bypass server cache (same as “Refresh MTG Goldfish”).
 */
export async function syncGoldfishDefaultsForFormat(userId, format, options = {}) {
  if (!userId || !format) return
  const payload = await fetchMetagameDefaults(options)
  const grid = ensureMetagameGrid(userId, format)
  const data = getDefaultsForFormat(payload, format)
  if (!hasSnapshotData(data)) return
  const next = applyLockedGoldfishDefaults(grid, data, format)
  if (JSON.stringify(next) !== JSON.stringify(grid)) {
    saveMetagameGrid(userId, format, next)
  }
}

/**
 * One API fetch; applies Goldfish defaults to every format the user has enabled.
 */
export async function syncGoldfishDefaultsForAllFormats(userId, options = {}) {
  if (!userId) return
  const formats = getFormats(userId)
  const payload = await fetchMetagameDefaults(options)
  for (const format of formats) {
    const grid = ensureMetagameGrid(userId, format)
    const data = getDefaultsForFormat(payload, format)
    if (!hasSnapshotData(data)) continue
    const next = applyLockedGoldfishDefaults(grid, data, format)
    if (JSON.stringify(next) !== JSON.stringify(grid)) {
      saveMetagameGrid(userId, format, next)
    }
  }
}
