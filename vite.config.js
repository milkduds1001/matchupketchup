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
          if (req.url !== '/api/metagame-defaults' || req.method !== 'GET') {
            next()
            return
          }
          try {
            const payload = await getMetagameDefaultsPayload()
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
