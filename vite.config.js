import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { getMetagameDefaultsPayload } from './api/metagame-defaults.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'metagame-defaults-dev-route',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const pathname = (req.url || '').split('?')[0]
          if (pathname !== '/api/metagame-defaults' || req.method !== 'GET') {
            next()
            return
          }
          try {
            const params = new URL(req.url || '/', 'http://vite.local').searchParams
            const bypassCache =
              params.get('refresh') === '1' ||
              params.get('refresh') === 'true' ||
              params.get('nocache') === '1'
            const payload = await getMetagameDefaultsPayload({ bypassCache })
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'Metagame defaults failed',
              })
            )
          }
        })
      },
    },
  ],
})
