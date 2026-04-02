# MatchupKetchup

Vite + React app for Magic: The Gathering sideboard planning (decklists, metagame matchups, printable guides).

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview   # optional: serve ./dist locally
```

## GitHub

This repo is intended to live on GitHub. Push updates to `main` (or your default branch); connected hosts will rebuild on push if you enable auto-deploy.

## Deploy + custom domain (Wix-purchased domain)

Step-by-step host setup, DNS records for domains bought through Wix, and the `/api/metagame-defaults` behavior are documented in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

**Quick picks**

| Host | Config in repo | Build | Output |
|------|----------------|-------|--------|
| [Vercel](https://vercel.com) | [vercel.json](vercel.json) | `npm run build` | `dist` |
| [Netlify](https://netlify.com) | [netlify.toml](netlify.toml) | `npm run build` | `dist` |
| [Cloudflare Pages](https://pages.cloudflare.com) | [functions/api/metagame-defaults.js](functions/api/metagame-defaults.js) | `npm run build` | `dist` |

All three wire **`GET /api/metagame-defaults`** in production (MTG Goldfish metagame defaults), matching the Vite dev server.

## ESLint

```bash
npm run lint
```
