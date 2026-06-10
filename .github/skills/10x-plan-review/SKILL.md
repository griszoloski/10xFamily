---
name: 10x-plan-review
description: >
  Review implementation plans for substance, feasibility, and architectural fitness.
  Use when user asks to review a plan, says "is this plan good", "check my plan",
  "review this plan", mentions plan review, or references a plan file and asks
  for feedback. Also trigger when user finishes /10x-plan and wants validation
  before starting /10x-implement.
---

# Plan Review

Catch substance problems in an implementation plan before a line of code is written. A flawed plan costs hours — a flawed review costs minutes.

Where `/10x-impl-review` asks "did we build what we planned?", this asks "will this plan actually work?"

Two modes:
- **Fresh review**: analyze → findings → interactive triage
- **Resume triage**: load a saved report and jump to per-issue triage

## Input resolution

1. Argument points to a saved review file (contains `<!-- PLAN-REVIEW-REPORT -->`) → **resume triage** (skip to Step 6)
2. Argument is a `<change-id>` and `context/changes/<change-id>/plan.md` exists → review that plan
3. Plan path provided (e.g. `@context/changes/<change-id>/plan.md`) → use it
4. No argument → list `context/changes/*/plan.md` (newest by `change.md.updated`) via Ask the user:
5. `--quick` flag → document-only mode (skip Step 3)

If the resolved plan path starts with `context/archive/`, refuse to write a review: print "This change is archived. Reviews are not appended to archived plans." and STOP.

## Step 1: Load and internal consistency scan

Read the plan file fully. Also read the sibling `plan-brief.md` in the same change folder if it exists. Read `context/foundation/lessons.md` if present and use accepted rules as priors when scanning for substance / feasibility / contract-break issues — a finding that restates a known recurring rule should weigh more, not less. Extract:
- **Desired End State** and **Success Criteria**
- **Current State Analysis** — documented constraints and gotchas
- **Scope boundaries** — "What We're NOT Doing"
- **Phases** — file paths, changes, dependencies
- **Decisions** and **assumptions** (explicit and implicit)
- **Progress section** — the canonical `## Progress` block at the bottom of the plan (see `references/progress-format.md`)

Before any code verification, check the plan against itself. These three scans often catch the highest-value issues — problems the plan author discovered but didn't fully follow through on:

- **Contradiction**: does Current State Analysis document a limitation the implementation ignores? (e.g., "npm doesn't run preuninstall for deps" yet phases rely on it