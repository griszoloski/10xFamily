---
bootstrapped_at: 2026-05-25T11:25:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10x-family-schedule-hub
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-family-schedule-hub
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

10x Astro Starter (Astro 6 + React 19 + TypeScript + Supabase + Cloudflare) covers all must-have functional requirements — auth, PostgreSQL database for event storage, and edge deployment — without requiring additional service integration. The starter's opinionated conventions (file-based routing, Zod schemas at boundaries, Supabase RLS for data isolation) align directly with the PRD's household-privacy guardrail and resource-conflict detection logic. For a 3-week after-hours solo build targeting a small user base, the batteries-included approach minimizes scaffolding decisions and lets implementation start on day one.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | — | cmd_template starts with `git clone`; npm recency check skipped |
| GitHub repo | not run | — | `gh` CLI not available in environment |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 43
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (absent in cwd)
**.github handling**: merged (scaffold's `workflows/ci.yml` moved into existing `.github/`)
**.bootstrap-scaffold cleanup**: deleted
**Node engine warnings**: Multiple EBADENGINE warnings — local Node v18.19.1, starter requires >=22.12.0. Dependencies installed but runtime may fail until Node is upgraded.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0

#### HIGH findings

- **devalue** v5.6.3–5.8.0 — "DoS via sparse array deserialization" (GHSA-77vg-94rm-hx3p, CVSS 7.5). Transitive dependency. Fix available.

#### MODERATE findings

- **ws** v8.0.0–8.20.0 — "Uninitialized memory disclosure" (GHSA-58qx-3vcg-4xpx, CVSS 4.4). Transitive via miniflare, @supabase/realtime-js. Fix available.
- **yaml** v2.0.0–2.8.2 — "Stack Overflow via deeply nested YAML collections" (GHSA-48c2-rrv3-qjmp, CVSS 4.3). Transitive via yaml-language-server → volar-service-yaml → @astrojs/language-server. Fix available (requires @astrojs/check downgrade).
- **miniflare** — transitive via ws. Fix available.
- **wrangler** — direct dependency, affected via miniflare → ws. Fix available.
- **@cloudflare/vite-plugin** — transitive via miniflare, wrangler, ws. Fix available.
- **@astrojs/check** — direct dependency, affected via @astrojs/language-server → volar-service-yaml → yaml-language-server → yaml. Fix requires semver-major downgrade.
- **@astrojs/language-server** — transitive via volar-service-yaml. Fix available.
- **volar-service-yaml** — transitive via yaml-language-server. Fix available.
- **yaml-language-server** — transitive via yaml. Fix available.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | false |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Upgrade Node.js to >=22.12.0 (`nvm install 22` or update `.nvmrc` target) — the starter requires it.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep (none were created this run).
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
