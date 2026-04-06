/**
 * Writes public/metagame-defaults.json for static hosts (GitHub Pages, etc.)
 * that cannot run /api/metagame-defaults. Runs automatically before vite build.
 */
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const publicDir = join(root, 'public')
const outPath = join(publicDir, 'metagame-defaults.json')

const emptyPayload = {
  source: 'MTG Goldfish',
  snapshotLabel: 'Last 30 Days',
  fetchedAt: new Date(0).toISOString(),
  formats: {
    Standard: [],
    Pioneer: [],
    Modern: [],
    Legacy: [],
  },
  unavailable: true,
  error: 'Build could not fetch live metagame data (offline CI or network). Redeploy with network access or use a host with serverless API.',
}

async function main() {
  await mkdir(publicDir, { recursive: true })
  try {
    const { getMetagameDefaultsPayload } = await import('../api/metagame-defaults.js')
    const payload = await getMetagameDefaultsPayload({ bypassCache: true })
    const { cached: _c, ...rest } = payload
    const out = {
      ...rest,
      cached: false,
    }
    await writeFile(outPath, JSON.stringify(out))
    console.log('[build-metagame-defaults] wrote public/metagame-defaults.json')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[build-metagame-defaults] fetch failed, writing empty snapshot:', msg)
    await writeFile(outPath, JSON.stringify(emptyPayload))
  }
}

main()
