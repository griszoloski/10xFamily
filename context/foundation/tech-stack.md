---
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
---

## Why this stack

10x Astro Starter (Astro 6 + React 19 + TypeScript + Supabase + Cloudflare) covers all must-have functional requirements — auth, PostgreSQL database for event storage, and edge deployment — without requiring additional service integration. The starter's opinionated conventions (file-based routing, Zod schemas at boundaries, Supabase RLS for data isolation) align directly with the PRD's household-privacy guardrail and resource-conflict detection logic. For a 3-week after-hours solo build targeting a small user base, the batteries-included approach minimizes scaffolding decisions and lets implementation start on day one.
