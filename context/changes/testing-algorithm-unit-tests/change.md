---
change_id: testing-algorithm-unit-tests
title: Bootstrap Vitest and unit-test the conflict-detection algorithm
status: implemented
created: 2026-06-25
updated: 2026-06-25
archived_at: null
---

## Notes

Rollout Phase 1 of context/foundation/test-plan.md — "Algorithm unit tests".
Risks covered: R1 (conflict detection false negative), R2 (conflict detection false positive), R6 (same-day filter timezone edge at midnight boundary).
Test types planned: unit tests.
Risk response intent:
- R1: prove that two car-flagged overlapping events produce an alert; prove that events touching at end==start do NOT (PRD Business Logic: touching is not overlapping).
- R2: prove that non-overlapping pairs, no-car-flag pairs, and different-day pairs produce NO alert.
- R6: prove that events on the same calendar day near midnight in UTC+2 are treated as same-day (bonus test case).
