---
change_id: car-conflict-alert
title: Car conflict alert for overlapping car-needed events
status: implemented
created: 2026-06-23
updated: 2026-06-23
archived_at: null
---

## Notes

S-02 (North Star) z roadmapy. Gdy co najmniej dwa wydarzenia tego samego dnia mają flagę `car_needed = true` i nakładające się okna czasowe `[starts_at, starts_at + duration_minutes]`, użytkownik widzi wyraźny alert konfliktu z tytułami, godzinami i osobami. Brak false positive dla wydarzeń bez flagi auta. PRD refs: FR-007, US-01.
