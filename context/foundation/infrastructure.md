---
project: 10x-family-schedule-hub
researched_at: 2026-05-27
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare workerd
---

## Recommendation

**Deploy on Cloudflare Workers (via Pages Functions).**

The project already ships with `@astrojs/cloudflare` adapter and `wrangler.jsonc` — Cloudflare is the zero-friction path requiring no adapter swap, no Dockerfile, and no runtime change. It scores Pass on all five agent-friendly criteria (CLI-first via `wrangler`, fully managed/serverless, markdown docs + MCP servers, deterministic deploy API, and first-class MCP integration). The free tier (100k requests/day) far exceeds MVP needs at $0/month, directly satisfying the cost-minimization constraint.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Cost (MVP) | Adapter fit |
|---|---|---|---|---|---|---|---|
| **Cloudflare** | Pass | Pass | Pass | Pass | Pass | $0 | Native ✓ |
| **Vercel** | Pass | Pass | Partial | Pass | Pass | $0 | Swap to @astrojs/vercel |
| **Render** | Pass | Partial | Pass | Pass | Pass | $0–7/mo | Swap to @astrojs/node |
| **Netlify** | Partial | Pass | Partial | Partial | Pass | $0 | Swap to @astrojs/netlify |
| **Railway** | Pass | Partial | Pass | Pass | Pass | $5/mo | Swap to @astrojs/node |
| **Fly.io** | Pass | Partial | Pass | Pass | Pass | $2–6/mo | Swap + Dockerfile |

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

Native fit: the project's `@astrojs/cloudflare` adapter, `wrangler.jsonc`, and `.dev.vars` secret handling are already configured. All five agent-friendly criteria pass. The free tier (100k requests/day, 10ms CPU/request) is sufficient for years of family-scale usage. `wrangler deploy` is a single deterministic command. Official MCP servers cover docs, observability, and deployment operations. Docs are open-source markdown on GitHub with a published documentation MCP server.

#### 2. Vercel

Strong fallback if Cloudflare proves limiting. Generous Hobby free tier (1M function invocations/month). Excellent CLI (`vercel --prod`, `vercel rollback`, `vercel logs`). MCP integration is GA (`vercel mcp` command). Main gap: docs are JS-rendered (no `llms.txt`), and deploying requires swapping to `@astrojs/vercel` adapter — which changes how env vars and middleware behave.

#### 3. Render

Best-in-class agent docs story: publishes `llms.txt` and `llms-full.txt`, has a hosted MCP server with structured tools. Free tier available (with 60s cold starts on idle). Requires `@astrojs/node` adapter swap and binding to `HOST=0.0.0.0` + `PORT=10000`. Not serverless — runs as a persistent Node.js process, which is more infra surface than needed for this request/response-only app.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **workerd is not Node.js.** Despite `nodejs_compat`, certain Node.js APIs (filesystem, native addons, `child_process`) are unavailable. Packages relying on them fail at deploy time, not dev time.
2. **128 MB memory per isolate.** Large in-memory operations (conflict detection across 200+ events, large Supabase result sets) can OOM with an opaque "Worker exceeded memory limit" error.
3. **Cold starts after deploy.** Astro SSR bundles are larger than simple Workers — initial requests post-deploy may see 50–200ms latency.
4. **KV is eventually consistent (~60s).** If server-side session state is ever needed beyond Supabase auth cookies, cross-region propagation delay can cause auth race conditions.
5. **Harder debugging.** No stdout in production — requires `wrangler tail` or Workers Logs. Stack traces from workerd are less informative than Node.js.

### Pre-Mortem — How This Could Fail

Six months in, the scheduling app grew beyond initial CRUD. A feature requiring PDF generation for weekly schedule summaries needed `puppeteer` — unavailable on workerd. The developer tried Cloudflare Browser Rendering (beta), but it was unreliable and region-limited. A dependency update in `@supabase/ssr` introduced a Node.js API call that worked in local dev (workerd masks some issues) but crashed in production with a cryptic "No such module" error. Debugging took days because Workers Logs showed only the final crash, not the dependency chain. The 128MB limit hit when loading 200+ events for monthly conflict detection, causing random 502s misdiagnosed as Supabase timeouts. The team realized too late that accumulated runtime constraints made migration cost higher than starting on Node.js would have been.

### Unknown Unknowns

- `astro dev` runs on workerd locally (good parity), but Vitest runs on Node.js — test-passing code can still fail on workerd if it touches Node-only APIs.
- Cloudflare Pages deployment was removed in `@astrojs/cloudflare` v13 — it's Workers-only now. Stale tutorials referencing Pages Functions will mislead.
- Workers have a 25 MB uncompressed bundle size limit (free: 10 MB compressed). A growing Astro app with many islands can silently approach this with no warning until deploy fails.
- `env` access changed: `Astro.locals.runtime` is removed → must use `import { env } from 'cloudflare:workers'`, which is Cloudflare-specific and non-portable.
- Supabase Edge Functions run on Deno, not workerd — if ever used alongside Workers, you manage two serverless runtimes.

## Operational Story

- **Preview deploys**: Every push to a non-production branch creates a preview deployment at `<hash>.<project>.workers.dev`. Configure Cloudflare Access to password-protect previews if household data is present.
- **Secrets**: Managed via `wrangler secret put <KEY>` (stored in Workers Secrets vault). Locally, secrets go in `.dev.vars` (gitignored). CI secrets live in GitHub Actions repository secrets and are passed at build time.
- **Rollback**: `wrangler versions --rollback` reverts to the prior deployment version. Time-to-revert: seconds. Caveat: Supabase database migrations do not roll back automatically — plan migration reversibility separately.
- **Approval**: Agent may deploy to preview unattended. Production deploy (`wrangler deploy`) is permitted after CI passes. Destructive actions (delete project, rotate API tokens, drop Supabase tables) are human-only.
- **Logs**: `wrangler tail` streams real-time logs. `wrangler tail --format json` for structured output an agent can parse. Workers Logs (dashboard) provides historical retention.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| npm package uses unsupported Node.js API → deploy failure | Devil's advocate | M | M | Pin dependencies; test with `wrangler dev` before merge; add `nodejs_compat` flag |
| 128 MB memory OOM on large event sets | Devil's advocate | L | H | Paginate Supabase queries; never load full month's events into memory at once |
| Bundle size exceeds 25 MB limit as app grows | Unknown unknowns | L | H | Monitor bundle size in CI (`wrangler deploy --dry-run`); code-split aggressively |
| Vitest passes but workerd fails (runtime mismatch) | Unknown unknowns | M | M | Run `wrangler dev` smoke tests in CI; avoid Node-only APIs in server code |
| Stale tutorials reference removed Pages deployment | Unknown unknowns | M | L | Always reference `@astrojs/cloudflare` v13+ docs; ignore pre-2025 tutorials |
| KV eventual consistency causes auth race conditions | Devil's advocate | L | M | Use Supabase for all auth state; avoid KV for session-critical data |
| PDF/image generation needed but unavailable on workerd | Pre-mortem | L | H | Offload to external service (e.g., Supabase Edge Function on Deno, or a dedicated API) if the need arises |

## Getting Started

1. **Verify Node version**: `node -v` should show >=22.12.0 (see `.nvmrc`). Run `nvm use` if needed.
2. **Set up local secrets**: Copy `.env.example` to `.dev.vars` with your Supabase URL and key.
3. **Start local dev**: `npm run dev` — Astro 6 with `@astrojs/cloudflare` runs on workerd locally via Vite.
4. **Deploy to Cloudflare**: `npx wrangler deploy` — uses the existing `wrangler.jsonc` configuration.
5. **Set production secrets**: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (see `@.github/workflows/ci.yml` for existing config)
- Production-scale architecture (multi-region, HA, DR)
