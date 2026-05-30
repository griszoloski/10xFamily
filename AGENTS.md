# Repository Guidelines

10xFamily Schedule Hub — an Astro 6 SSR web app with React 19 islands, Tailwind CSS 4, Supabase auth/database, and Cloudflare Workers deployment.

## Hard Rules

- Never bypass pre-commit hooks (`--no-verify`). Husky runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.
- Never expose Supabase credentials in client code. Env vars are server-only secrets declared via `astro:env/server` in @astro.config.mjs.
- Always enable RLS on new Supabase tables with granular per-operation, per-role policies.
- Do not use `"use client"` or other Next.js directives — this is Astro, not Next.
- Do not concatenate Tailwind class strings. Use `cn()` from `@/lib/utils` for conditional/merged classes.

## Project Structure

- `src/pages/` — file-based routes (Astro pages + `api/` endpoints)
- `src/components/` — Astro for layout/static; `ui/` for shadcn/ui; `auth/` for React auth forms
- `src/lib/` — services, helpers, Supabase client (`supabase.ts`), utility functions
- `src/types.ts` — shared types and DTOs
- `src/middleware.ts` — resolves auth session, guards routes in `PROTECTED_ROUTES`
- `supabase/migrations/` — SQL migrations named `YYYYMMDDHHmmss_short_description.sql`
- `context/foundation/` — PRD and tech-stack hand-off (do not edit without re-running the bootstrap chain)

## Commands

- `npm run dev` — local dev server (Cloudflare workerd runtime)
- `npm run build` — production build (requires `SUPABASE_URL`, `SUPABASE_KEY`)
- `npm run lint` — ESLint with strict type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (double quotes, 120 char width, trailing commas)

## Coding Conventions

- Path alias: `@/*` → `./src/*`. Always use it for cross-directory imports.
- Astro components for static content/layout; React components only when interactivity is required.
- Validate input with Zod.
- shadcn/ui: "new-york" style variant, installed via `npx shadcn@latest add [name]`, lives in `src/components/ui/`.
- React hooks go in `src/components/hooks/`.
- Services and business logic go in `src/lib/` (or `src/lib/services/`).

## CI Gate

GitHub Actions on push/PR to `master`: `npm ci` → `astro sync` → `lint` → `build`. See @.github/workflows/ci.yml.

## Environment

Node.js v22.14.0 (see @.nvmrc). Copy `.env.example` → `.env` (or `.dev.vars` for Cloudflare local dev). Local Supabase requires Docker: `npx supabase start`.
