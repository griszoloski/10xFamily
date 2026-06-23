# Car Conflict Alert — Plan Brief

> Full plan: `context/changes/car-conflict-alert/plan.md`

## What & Why

Implementacja rdzenia wartości produktu: gdy rodzic ma dwa lub więcej wydarzeń tego samego dnia z `car_needed=true` i nakładającymi się oknami czasowymi, aplikacja wyraźnie go o tym informuje. Bez tej funkcji użytkownik musi samodzielnie pilnować konfliktów w głowie — główna luka produktowa opisana w PRD (FR-007, US-01).

## Starting Point

Pełny CRUD wydarzeń (S-01, S-03) jest gotowy. `listEvents` zwraca `EventWithProfiles[]` z wszystkimi polami potrzebnymi do detekcji. Schema `events` ma już `events_car_needed_partial_idx` i `starts_at + duration_minutes` — infrastruktura jest gotowa, brakuje wyłącznie logiki detekcji i UI alertów.

## Desired End State

Na stronie `/events` pojawiają się czerwone banery — jeden per para kolidujących wydarzeń — zawierające tytuły, godziny i osoby obu wydarzeń. Kolidujące karty są wizualnie oznaczone. Po dodaniu lub edycji wydarzenia z `car_needed=true` użytkownik widzi baner nawigacyjny kierujący wzrok na alerty konfliktu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Gdzie liczyć konflikty | TypeScript in memory | Reużywa danych z `listEvents`, zero dodatkowych zapytań, O(n²) jest ok przy small-scale household | Plan |
| Punkt styku | NIE jest konfliktem | Roadmap precyzuje strict overlap: `aStart < bEnd && bStart < aEnd` | Plan |
| Definicja "tego samego dnia" | `.slice(0, 10)` na `starts_at` | Spójne z MVP "no timezone conversion", te same zasady co formularz | Plan |
| Gdzie wyświetlić alert | Top banery + oznaczenia kart na `/events` | Jedyny istniejący widok listy; dashboard Dziś (S-04) przejmie rolę docelową | Plan |
| Format alertów | Jeden baner per kolizja | Czytelne — widać co z czym koliduje; dopuszczalne N baner-ów przy small-scale | Plan |
| Signal po zapisie | `?car_conflict=1` w redirect URL | Minimalna zmiana API, event page sam liczy konflikty — baner nawigacyjny wskazuje sekcję | Plan |

## Scope

**In scope:**
- `detectCarConflicts(events: EventWithProfiles[]): ConflictPair[]` w `src/lib/services/events.ts`
- Banery per-para na `/events`
- Wizualne oznaczenie kart kolidujących wydarzeń
- Baner nawigacyjny po CREATE/EDIT z `car_needed=true`
- Parametr `?car_conflict=1` w redirect z API routes

**Out of scope:**
- Detekcja konfliktów live podczas wypełniania formularza
- Postgres `tstzrange &&` (plan B na skalę, niepotrzebny dla MVP)
- Alerty w emailach/powiadomieniach
- Dashboard Dziś (S-04)
- Multi-resource logistyka (wiele aut, rowery)

## Architecture / Approach

Czysto serwerowy flow: `detectCarConflicts` jest wywołana w frontmatter Astro, przetwarza już załadowane events, zwraca `ConflictPair[]`. Template renderuje banery i buduje `Set<string>` conflicting IDs dla card indicators — bez dodatkowych React islands. API routes sprawdzają `car_needed` z zwalidowanych Zod danych i dołączają `&car_conflict=1` do redirect URL tylko gdy flaga jest aktywna.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Conflict Detection Service | `detectCarConflicts` + `ConflictPair` type | Niepoprawna obsługa touch point (fix: strict `<`, nie `<=`) |
| 2. Events List Visual Alerts | Banery per-para + card indicators + `car_conflict` notice | Wiele par → wiele banerów — potrzebna weryfikacja layoutu |
| 3. API Signal on Save | CREATE/EDIT dołącza `car_conflict=1` do redirect gdy `car_needed=true` | Niespójność gdy `car_needed` zmienia się podczas edycji — fix: zawsze sprawdzaj zwalidowane dane |

**Prerequisites:** S-01 i S-03 ukończone (są).  
**Estimated effort:** ~1-2 sesje, 3 fazy sekwencyjne.

## Open Risks & Assumptions

- Zakładamy naiwne ISO stringy bez timezone w `starts_at` — spójne z obecnym formularzem; zmiana mechanizmu zapisu timezone wymagałaby rewizji algorytmu
- Przy > ~50 parach konfliktów (nierealistyczne dla MVP) lista banerów może być niepraktyczna — wymagałoby agregacji; nie blokuje MVP

## Success Criteria (Summary)

- Dwa car_needed events z overlappem → wyraźny baner z nazwami, godzinami, osobami
- Touch point i non-car events → zero false positives
- Po dodaniu car_needed event → baner nawigacyjny natychmiast widoczny
