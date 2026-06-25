---
project: "10xFamily Schedule Hub"
version: 1
created: 2026-06-25
test_base_profile: none
---

# Test Plan: 10xFamily Schedule Hub

## §1 Strategy

**Principle 1 — Cost × signal.** Every test added must answer: *what is the cheapest test that gives a real signal for this risk?* Do not promote to e2e because it "feels safer"; do not layer AI-native tooling on top of a deterministic check that already catches the regression.

**Principle 2 — User concerns are evidence.** Risks the team has lived through or explicitly stated carry the same weight as PRD lines or hot-spot data.

**Principle 3 — Risks are scenarios, not code locations.** The risk map (§2) cites PRD lines, interview answers, impl-review findings, and hot-spot directories as likelihood evidence. It never cites a file path or function name as the "anchor" of a failure. File-level anchors are `/10x-research` output, produced per rollout phase against the up-to-date code.

---

## §2 Risk Map

| # | Risk (failure scenario) | Impact | Likelihood | Source(s) — evidence, not anchors |
|---|---|---|---|---|
| R1 | Conflict detection false negative — two car-flagged overlapping events produce no alert | HIGH | MEDIUM | PRD FR-007, US-01 AC, roadmap S-02 risk note ("false negative = brak wartości produktu"), user interview Q1 |
| R2 | Conflict detection false positive — non-overlapping or no-car-flag events trigger a spurious alert | HIGH | MEDIUM | PRD FR-007 AC ("brak false positive"), user interview Q1 |
| R3 | Event edit data corruption — `starts_at` pre-filled incorrectly (timezone slice), `updated_at` not updated, `driver_id` not cleared when `car_needed=false` | HIGH | MEDIUM | impl-review S-01 F4/F5 (PENDING), S-03 plan key discoveries, user interview Q1 |
| R4 | EventForm state/props regression — car/driver toggle, edit pre-fill, or submitted values break on any component change | MEDIUM | HIGH | user interview Q3 (stated confidence gap), hot-spot dir `src/components/events/` (2 commits/30d) |
| R5 | IDOR on event endpoints — user mutates another household's event via crafted event ID | HIGH | LOW | PRD NFR (household isolation), impl-review car-conflict-alert W4 (no UUID validation — PENDING), abuse lens (auth surfaces with per-row data present) |
| R6 | Same-day filter timezone edge — UTC `.slice(0,10)` misclassifies events near midnight for a UTC+2 household, skewing conflict detection scope | MEDIUM | LOW | impl-review car-conflict-alert O1 (PENDING) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context needed | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| R1 | Two overlapping car-flagged events → alert fires; events that merely touch (end == start) do NOT trigger | "Overlap handles boundary: end==start is not a conflict per PRD Business Logic" | Exact overlap condition in conflict detection service, how same-day is determined | Unit test on the pure detection function | Happy-path only (two clearly overlapping events), never testing the touching-boundary edge case |
| R2 | No-car-flag pair → no alert; different-day pair → no alert; non-overlapping pair → no alert | "car_needed filter is applied before the overlap check" | How the detection function filters by `car_needed` and same-day before comparing intervals | Unit test (negative cases on same pure function as R1) | Testing only alert presence, never alert absence |
| R3 | After edit: `starts_at` matches user input, `updated_at > created_at`, `driver_id` is null when `car_needed=false` | "Service sets `updated_at` automatically" — it does NOT; it must be set manually per S-03 plan | `updateEvent` implementation, how `starts_at` is pre-filled in edit mode, driver/car invariant in update path | Service-layer test with mocked Supabase client | Asserting current output rather than user-typed value as the oracle (tautological assertion) |
| R4 | Car/driver toggle hides+clears driver when unchecked; edit pre-fill populates all fields; form submits correct values | "The form renders correctly" ≠ "the form submits correctly after state transitions" | `EventForm` props interface, `initialValues` shape, car_needed state interaction with driver_id rendering | React component test (Vitest + @testing-library/react) | Snapshot test (breaks on any class change, catches nothing behavioral) |
| R5 | PUT/DELETE to event endpoint with another household's event ID → 404/no mutation | "RLS alone is sufficient" — the endpoint should also reject before a DB round-trip; impl-review W4 found no UUID validation (PENDING) | How event service functions verify ownership; whether the route checks household membership before querying | Integration test against local Supabase with two distinct test users | Testing only own-household happy path, never cross-household access |
| R6 | Events on the same calendar day in UTC+2 near midnight are treated as same day for conflict detection | "`.slice(0,10)` works regardless of timezone" — it compares UTC date, not local calendar day | How same-day comparison is implemented in the detection function | Unit test with midnight-boundary cases (bonus case in Phase 1) | Ignoring this edge case entirely — it is a known accepted MVP risk per impl-review O1 |

---

## §3 Phased Rollout

| # | Phase name | Goal | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Algorithm unit tests | Bootstrap Vitest; prove the conflict-detection function correct across all cases including boundaries | R1, R2, R6 | Unit | change opened | context/changes/testing-algorithm-unit-tests/ |
| 2 | Component + service coverage | Prove EventForm behavior and edit-path data invariants | R3, R4 | React component, service-layer (mocked) | not started | — |
| 3 | Security baseline + CI gate | Verify IDOR protection against local Supabase; wire lint+test into CI | R5 | Integration (local Supabase), CI YAML | not started | — |

---

## §4 Stack

- **Language / runtime**: TypeScript, Node.js v22.14.0
- **Framework**: Astro 6 SSR + React 19 islands
- **Database**: Supabase (PostgreSQL + RLS); local dev via `npx supabase start`
- **Deployment**: Cloudflare Workers (`@astrojs/cloudflare`)
- **Existing test infra**: **none** — no test runner configured, 0 test files as of 2026-06-25
- **Natural fit**:
  - Unit / component: Vitest + `@testing-library/react` (dominant choice for Astro+React+TypeScript stacks; integrates with Vite build already present)
  - Integration (RLS/ownership): local Supabase instance (`npx supabase start`)
  - E2E: Playwright — not planned for current phases; revisit if Phase 3 integration approach proves insufficient
- **Test runner to bootstrap**: Vitest (Phase 1 first sub-phase)
- **Stack grounding tools (current session)**:
  - Docs: none — not available in current session; checked: 2026-06-25
  - Search: none — not available in current session; checked: 2026-06-25
  - Runtime/browser: none — not available; checked: 2026-06-25
  - Provider/platform: none — not available; checked: 2026-06-25

---

## §5 Negative Space

Tests explicitly out of scope for this rollout:

| Area | Reason |
|---|---|
| Supabase auth flow (signup, signin, signout) | User explicitly excluded (Q5); Supabase owns the auth logic; not a household-app risk |
| UI snapshot tests | Anti-pattern for behavioral regressions; breaks on class changes; catches nothing meaningful |
| Static / marketing pages (index, confirm-email) | No domain logic; zero blast radius |
| Nice-to-have PRD features (FR-009–FR-012) | Parked in roadmap; not implemented |
| Multi-resource conflict logic (multiple cars, carpooling) | PRD Non-Goal; not implemented |
| Admin vs member role separation | Open Question in PRD/roadmap; not implemented |

---

## §6 Cookbook (populated per phase as tests ship)

### Phase 1 — Algorithm unit tests

TBD — see §3 Phase 1. Pattern to capture: cheapest unit test for the conflict-detection pure function covering R1 (false negative), R2 (false positive), and R6 (midnight-boundary edge case). Research will ground the exact function signature and edge-case inventory before the cookbook entry is written.

### Phase 2 — Component + service coverage

TBD — see §3 Phase 2. Patterns to capture: (a) React component test pattern for controlled-input form with conditional fields (R4 — EventForm car/driver toggle); (b) service-layer test pattern with mocked Supabase client for data-invariant verification (R3 — edit update path). Research will ground the exact mocking approach for `@supabase/ssr` in a Vitest environment.

### Phase 3 — Security baseline + CI gate

TBD — see §3 Phase 3. Patterns to capture: (a) two-user integration test against local Supabase to verify RLS-enforced ownership (R5 — IDOR); (b) GitHub Actions YAML addition to run `vitest` and `eslint` on every PR. Research will ground the local Supabase test setup for TypeScript service functions.

---

## §7 Refresh Cadence

Re-run `/10x-test-plan --refresh` when:
- A new top-3 risk surfaces (e.g., onboarding second household member, if that slice lands)
- A tool's `checked:` date in §4 is > 3 months old
- The tech stack changes (Vitest major version, Supabase client API)
- §7 negative space no longer matches what is implemented (e.g., multi-member household ships)
