# Plan: First Deploy to Cloudflare Workers

Deploy the Astro 6 SSR app to Cloudflare Workers using the existing `@astrojs/cloudflare` adapter and `wrangler` CLI. Rename the worker, initialize git, push to a private GitHub repo, set secrets, and verify the live site at `10x-family-schedule-hub.<account>.workers.dev`.

## Prerequisites (user-confirmed)

- ✅ Cloudflare account exists, `wrangler` authenticated
- ✅ Supabase cloud project exists with URL + anon key
- ✅ `node_modules` installed, project builds
- ✅ GitHub repo to be created (private)
- ✅ Worker name: `10x-family-schedule-hub`
- ✅ Domain: `*.workers.dev` (no custom domain)

---

## Phase 1: Project Preparation

**Step 1 — Rename worker in `wrangler.jsonc`**
- Change `"name": "10x-astro-starter"` → `"name": "10x-family-schedule-hub"`

**Step 2 — Verify local build**
- Run `npm run build` — should succeed without Supabase vars (env schema marks them `optional: true`)

---

## Phase 2: Git + GitHub

**Step 3 — Initialize git**
- `git init -b master`
- Verify `.gitignore` covers `node_modules/`, `.dev.vars`, `dist/`, `.wrangler/`

**Step 4 — Initial commit**
- `git add . && git commit -m "feat: initial scaffold – Astro 6 + Cloudflare Workers"`

**Step 5 — Create private GitHub repo + push**
- `gh repo create 10xFamily --private --source=. --remote=origin --push`
- `gh` CLI v2.45.0 confirmed available and authenticated (account: `g-wisniewski_srad`, scopes: `repo`)

**Step 6 — Configure GitHub secrets** *(manual — browser)*
- Repo → Settings → Secrets → Actions → add `SUPABASE_URL` and `SUPABASE_KEY`
- Required for CI build step to pass

---

## Phase 3: Deploy to Cloudflare

**Step 7 — Deploy**
- `npx wrangler deploy`
- Creates worker + uploads assets → prints live URL `https://10x-family-schedule-hub.<subdomain>.workers.dev`

**Step 8 — Set production secrets**
- `npx wrangler secret put SUPABASE_URL` (paste value)
- `npx wrangler secret put SUPABASE_KEY` (paste value)
- Stored encrypted in Workers Secrets vault — never in code


---

## Phase 4: Verification

| Check | How | Expected |
|---|---|---|
| Build passes | `npm run build` exits 0 | Step 2 |
| Deploy succeeds | `npx wrangler deploy` prints URL | Step 7 |
| Landing page loads | GET `/` → 200 + HTML | Browser |
| Auth guard works | GET `/dashboard` → 302 to `/auth/signin` | Browser |
| CI green | GitHub Actions tab | After push |

Optional: `npx wrangler tail` to stream live logs and confirm request handling.

---

## Relevant files

- `wrangler.jsonc` — rename `"name"` field (only change needed)
- `astro.config.mjs` — no changes (adapter + env schema correct)
- `.github/workflows/ci.yml` — no changes (lint+build gate, no auto-deploy)
- `src/middleware.ts` — no changes (graceful null handling)

---

## Decisions

- **No CI auto-deploy** — deploys remain manual (`wrangler deploy`). Can add later with `CLOUDFLARE_API_TOKEN` secret.
- **No custom domain** — `*.workers.dev` for MVP.
- **Two secret stores** — GitHub secrets (CI build) + Cloudflare Workers secrets (runtime). Both required.

## Further Considerations

1. **Auto-deploy on merge:** Adding `npx wrangler deploy` to CI after build would enable push-to-deploy. Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets. Recommend deferring — easy to add later.
