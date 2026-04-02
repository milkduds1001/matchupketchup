# Deployment: GitHub, static host, and Wix domain

## 1. GitHub

1. Create a repository (or use the existing remote).
2. Push your branch, for example:
   ```bash
   git remote add origin https://github.com/<you>/<repo>.git   # if needed
   git push -u origin main
   ```
3. Do **not** commit secrets (`.env`, personal tokens, `GIT*.docx`, etc.). See [.gitignore](../.gitignore).

## 2. Connect a host (pick one)

### Vercel

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. **Add New Project** → import this repo.
3. Framework: **Vite** (or leave auto-detect). Build: `npm run build`, output: `dist`.
4. Deploy. The file [api/metagame-defaults.js](../api/metagame-defaults.js) is deployed automatically as **`/api/metagame-defaults`** (Node serverless). [vercel.json](../vercel.json) pins build/output for consistency.

### Netlify

1. Sign in at [netlify.com](https://netlify.com) with GitHub.
2. **Add new site** → Import from Git → select repo.
3. Build command: `npm run build`, publish directory: `dist`.
4. [netlify.toml](../netlify.toml) adds a redirect so **`/api/metagame-defaults`** maps to the function in [netlify/functions/metagame-defaults.mjs](../netlify/functions/metagame-defaults.mjs).

### Cloudflare Pages

1. In [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → Connect Git.
2. Build command: `npm run build`, build output: `dist`.
3. [functions/api/metagame-defaults.js](../functions/api/metagame-defaults.js) provides **`/api/metagame-defaults`** as a Pages Function.

**Node:** The project expects **Node 18+** ([package.json](../package.json) `engines`).

## 3. Smoke test after first deploy

1. Open the host’s preview URL (`*.vercel.app`, `*.netlify.app`, `*.pages.dev`).
2. Load the app and open the metagame flow that fetches defaults.
3. Optionally verify the API directly: `https://<your-preview-host>/api/metagame-defaults` should return JSON.
4. To **force a new scrape** (bypass the server’s 24h memory cache): `GET /api/metagame-defaults?refresh=1` — the in-app **Refresh MTG Goldfish** button uses this.

### Troubleshooting MTG Goldfish on Vercel (or any host)

- **Empty archetypes / `unavailable: true` in JSON:** MTG Goldfish may block or throttle requests from cloud datacenter IPs, or their HTML layout may have changed so the scraper in [`api/metagame-defaults.js`](../api/metagame-defaults.js) no longer finds tiles. Check the `error` field in the JSON response and Vercel **Functions** logs for the failing request.
- **Timeouts:** The API fetches four format pages **in parallel** to stay within typical serverless limits. [`vercel.json`](../vercel.json) sets `maxDuration` for `api/metagame-defaults.js` to 30s where your plan allows (Hobby caps at 10s).
- **“Refresh” used to show stale data:** Previously the server cached results for 24 hours and the UI refresh still hit that cache. **Refresh MTG Goldfish** now calls `?refresh=1` so each click triggers a new fetch when Goldfish allows it.

## 4. Custom domain (domain purchased from Wix)

Your domain registrar is Wix; **DNS** can stay at Wix or move elsewhere (e.g. Cloudflare).

### A. Keep DNS at Wix

1. In Wix: **Domains** → your domain → **DNS** / **Manage DNS records** (labels vary).
2. In your **host’s** dashboard: **Domains** → **Add custom domain** → enter `example.com` and optionally `www.example.com`.
3. Add the records the host shows, for example:
   - **Apex** (`example.com`): **A** records to the IPs the host lists, or an **ALIAS/ANAME** if Wix offers it.
   - **`www`**: **CNAME** to the target the host gives (e.g. `cname.vercel-dns.com`, Netlify subdomain, or `*.pages.dev`).
4. Remove conflicting **A/CNAME** records that still point at Wix hosting if you are not using a Wix site on this domain.
5. Wait for DNS (often under an hour; up to 48 hours). The host will provision **HTTPS** automatically.

### B. Optional: nameservers on Cloudflare

If Wix’s DNS is limiting: add the site to Cloudflare, copy the two nameservers into Wix’s domain settings, then create the **A/CNAME** records Cloudflare (and your host) require.

## 5. GitHub Pages (not recommended for this app)

GitHub Pages serves **static files only**. There is **no** `/api/metagame-defaults` unless you add a separate backend or serverless elsewhere. Prefer Vercel, Netlify, or Cloudflare Pages as above.

## Checklist

| Step | Action |
|------|--------|
| 1 | Code on GitHub |
| 2 | Connect repo to Vercel / Netlify / Cloudflare Pages |
| 3 | Build `npm run build`, output `dist` |
| 4 | Test site + `/api/metagame-defaults` on preview URL |
| 5 | Add custom domain in host UI |
| 6 | Set DNS at Wix (or Cloudflare) per host instructions |
| 7 | Wait for DNS + HTTPS |
