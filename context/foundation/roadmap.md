---
project: "10xFamily Schedule Hub"
version: 1
status: draft
created: 2026-06-09
updated: 2026-06-09
prd_version: 1
main_goal: learn
top_blocker: time
---

# Roadmap: 10xFamily Schedule Hub

> Derived from [context/foundation/prd.md](../foundation/prd.md) (v1) + auto-researched codebase baseline (2026-06-09).
> Edit-in-place; archive when superseded.
> Slice'y są wymienione w kolejności zależności. Tabela "At a glance" to indeks; szczegóły w sekcjach Foundations / Slices.

## Vision recap

Rodzice trójki dzieci dzielący jedno auto potrzebują widoku, który odpowie na pytanie „czy ogarniemy ten dzień jednym samochodem?" zanim będzie za późno. MVP dostarcza minimalny harmonogram household + algorytm wykrywający nakładające się wydarzenia z flagą „auto potrzebne". Wedge produktu — jedyna cecha, której usunięcie czyni produkt zwykłym kalendarzem — to powiązanie dwóch okien czasowych z fizycznym zasobem (autem) i pokazanie alertu, zanim konflikt wystąpi w realu.

## North star

**S-02: Rodzic widzi alert konfliktu auta po dodaniu drugiego nakładającego się wydarzenia** — najmniejszy slice end-to-end, który udowadnia rdzenną hipotezę produktu (że detekcja konfliktu zasobu wnosi realną wartość ponad Google Calendar). Mapuje 1:1 na Primary Success Criterion PRD i na US-01.

> Gwiazda przewodnia (north star) to najmniejszy slice end-to-end, którego pomyślne dostarczenie udowodniłoby rdzenną hipotezę produktu — umieszczamy ją tak wcześnie, jak pozwalają Prerequisites, ponieważ reszta sekwencji ma znaczenie tylko, jeśli ten przepływ zadziała.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | events-schema-and-rls | (foundation) schemat `households` + `events` w Supabase z politykami RLS izolującymi dane per household; rejestracja zakłada minimalny household | — | NFR (izolacja danych household), Access Control | ready |
| S-01 | first-event-in-schedule | po rejestracji dodaje swoje pierwsze wydarzenie i widzi je na ekranie | F-01 | FR-001, FR-002, FR-003, US-01 (partial), NFR (mobilna responsywność 360px) | proposed |
| S-02 | car-conflict-alert | po dodaniu drugiego wydarzenia z flagą auta w nakładającym się oknie widzi wyraźny alert konfliktu | S-01 | FR-007, US-01 | proposed |
| S-03 | edit-and-delete-event | edytuje i usuwa istniejące wydarzenie bez ścieżki delete+re-add | S-01 | FR-004, FR-005 | proposed |
| S-04 | today-dashboard | po zalogowaniu widzi dashboard „Dziś" z dzisiejszymi wydarzeniami, informacją kto wiezie, alertami konfliktów i listą najbliższych | S-02 | FR-008, NFR (mobilna responsywność 360px) | proposed |

## Baseline

What's already in place in the codebase as of 2026-06-09 (auto-researched + user-confirmed). Foundations poniżej zakładają, że poniższe są obecne i NIE re-scaffolduje ich na nowo.

- **Frontend:** **present** — Astro 6 + React 19 + Tailwind 4 + shadcn/ui; layout, banner, topbar w [src/components/](../../src/components/), strony w [src/pages/](../../src/pages/). Per [tech-stack.md](./tech-stack.md).
- **Backend / API:** **partial** — wireup Astro endpoints działa, ale istniejące endpointy obejmują tylko auth ([signin.ts](../../src/pages/api/auth/signin.ts), [signup.ts](../../src/pages/api/auth/signup.ts), [signout.ts](../../src/pages/api/auth/signout.ts)); brak endpointów domenowych dla `events`.
- **Data:** **partial** — klient Supabase wpięty ([src/lib/supabase.ts](../../src/lib/supabase.ts)), `supabase/config.toml` obecny, ALE katalog `supabase/migrations/` nie istnieje, brak schematu `events` / `households`.
- **Auth:** **present** — Supabase SSR end-to-end: middleware z `PROTECTED_ROUTES` ([middleware.ts](../../src/middleware.ts)), API routes, formularze React ([SignInForm.tsx](../../src/components/auth/SignInForm.tsx), [SignUpForm.tsx](../../src/components/auth/SignUpForm.tsx)), strony auth, [dashboard.astro](../../src/pages/dashboard.astro) jako protected route.
- **Deploy / infra:** **present** — `@astrojs/cloudflare` v13, `wrangler.jsonc`, GitHub Actions CI. Cloudflare Workers wybrane w [infrastructure.md](./infrastructure.md).
- **Observability:** **absent** — brak Sentry / OTel / structured loggera; tylko ad-hoc `console.*`. Świadomie odłożone do `## Parked`.

## Foundations

### F-01: Schemat danych household + events + polityki RLS

- **Outcome:** (foundation) w Supabase istnieją tabele `households` i `events` o minimalnym zestawie kolumn wymaganych przez FR-003 (tytuł, osoba/dziecko, data, godzina, czas trwania, lokalizacja, notatki, flaga „auto potrzebne", kto jedzie); polityki RLS izolują wszystkie operacje per `household_id`; rejestracja przez Supabase Auth tworzy rekord `households` i wiąże usera jako pierwszego członka. Schemat jest celowo minimalny — brak kolumn pod cykliczność, przypomnienia, kategorie; każdy downstream S-NN dopisze brakujące pola własną migracją, gdy będzie ich potrzebował.
- **Change ID:** events-schema-and-rls
- **PRD refs:** FR-001, FR-002, NFR (izolacja danych household od dnia 1), Access Control (płaski model ról w household)
- **Unlocks:** S-01, S-02, S-03, S-04; redukuje blocking unknown „brak modelu danych dla wydarzeń"; otwiera ścieżkę weryfikacji RLS przez `supabase test`.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy household-id to dedykowana tabela `households` (UUID PK), czy `user_id` pierwszego rejestrującego się staje się de-facto household-id? — Owner: TBD (decyzja podczas /10x-plan). Block: no.
- **Risk:** Pomyłka w kształcie schematu lub politykach RLS jest kosztowna do migracji (każdy późniejszy slice korzysta z tego kontraktu). Trzymać minimalnie i pisać testy RLS od razu — to też cel `main_goal: learn`.
- **Status:** ready

## Slices

### S-01: Rodzic dodaje pierwsze wydarzenie do harmonogramu

- **Outcome:** użytkownik po rejestracji / zalogowaniu może wypełnić formularz wydarzenia (tytuł, osoba, data, godzina, czas trwania, lokalizacja, notatki, flaga „auto potrzebne", kto jedzie) i zapisać je w bazie. Po zapisie widzi swoje wydarzenie na prostym ekranie listy.
- **Change ID:** first-event-in-schedule
- **PRD refs:** FR-001, FR-002, FR-003, US-01 (partial — tylko gałąź „dodaje wydarzenie"), NFR (mobilna responsywność 360px)
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pierwsza ścieżka CRUD z walidacją Zod na boundary i RLS na DB; potencjalne luki polityk ujawnią się przy pierwszym realnym INSERT. To jest celowo wczesny moment nauki Supabase RLS (`main_goal: learn`).
- **Status:** proposed

### S-02: Rodzic widzi alert konfliktu auta (north star)

- **Outcome:** gdy w bazie istnieją co najmniej dwa wydarzenia tego samego dnia z flagą „auto potrzebne" i nakładającymi się oknami czasowymi `[godzina_start, godzina_start + czas_trwania]`, użytkownik widzi wyraźny alert konfliktu zawierający tytuły obu wydarzeń, godziny i osoby. Brak false positive dla wydarzeń bez flagi auta.
- **Change ID:** car-conflict-alert
- **PRD refs:** FR-007, US-01 (kompletne pokrycie z Acceptance Criteria)
- **Prerequisites:** S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Algorytm nakładania okien czasowych ma edge cases (koniec jednego = początek drugiego — czy to konflikt? z PRD Business Logic: tak, jeśli przedziały się „nakładają"; punkt styku nie nakłada się; decyzja należy do /10x-plan). To wedge produktu — false negative oznacza brak wartości produktu, false positive niszczy zaufanie. Test-first warto.
- **Status:** proposed

### S-03: Rodzic edytuje i usuwa wydarzenie

- **Outcome:** użytkownik może otworzyć istniejące wydarzenie w formularzu edycji, zmienić dowolne pole i zapisać; może też usunąć wydarzenie z jasnym potwierdzeniem.
- **Change ID:** edit-and-delete-event
- **PRD refs:** FR-004, FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Hard delete czy soft delete (`deleted_at`)? PRD tego nie precyzuje. — Owner: użytkownik. Block: no (domyślnie hard delete, do potwierdzenia w /10x-plan).
- **Risk:** Twardy delete jest najprostszy, ale jeśli późniejszy slice będzie agregował historyczne dane (np. statystyki — Parked), trzeba będzie przejść na soft delete. Dla `main_goal: learn` + małej skali użytkowników hard delete jest defensywny dziś.
- **Status:** proposed

### S-04: Dashboard "Dziś"

- **Outcome:** po zalogowaniu strona główna (`/dashboard`) pokazuje: (1) dzisiejsze wydarzenia w kolejności godziny, (2) informację kto wiezie / potrzebuje auta dla każdego, (3) alerty konfliktów wykryte przez algorytm z S-02, (4) listę najbliższych wydarzeń (kilka kolejnych dni). Strona jest użyteczna na ekranie ≥ 360 px.
- **Change ID:** today-dashboard
- **PRD refs:** FR-008, NFR (mobilna responsywność 360px), Secondary Success Criterion
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Ile dni naprzód kwalifikuje się jako „najbliższe wydarzenia" na dashboardzie? — Owner: użytkownik. Block: no (domyślnie 7 dni, do potwierdzenia w /10x-plan).
- **Risk:** Pierwsza zauważalna agregacja serwerowa pod Cloudflare Workers — uwaga na limit pamięci 128 MB per isolate (per [infrastructure.md](./infrastructure.md) risk register „Pre-mortem"). Paginować zapytania Supabase od razu.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | events-schema-and-rls | Foundation: events + households schema + RLS isolation | yes | Run `/10x-plan events-schema-and-rls` |
| S-01 | first-event-in-schedule | Add first event to schedule (form + persist + simple list) | no | After F-01 lands |
| S-02 | car-conflict-alert | Car-conflict alert when two car-flagged events overlap | no | After S-01 (north star — zaplanuj jako drugie) |
| S-03 | edit-and-delete-event | Edit and delete an existing event | no | After S-01 (równolegle z S-02) |
| S-04 | today-dashboard | Today dashboard with events, car ownership, conflict alerts | no | After S-02 |

## Open Roadmap Questions

1. **Role separation within household (admin vs member)** — Owner: użytkownik. Block: roadmap-wide dla scenariusza wielu członków household; nie blokuje MVP zakładającego model płaski, ale wpływa na kształt schematu RLS w F-01.
2. **Zarządzanie członkami household — sposób dołączania drugiego rodzica (zaproszenie e-mail / link / wspólne dane)** — Owner: użytkownik. Block: każda przyszła praca nad onboardingiem multi-member household (obecnie Parked); decyzja nie jest wymagana dla single-user household w MVP.

## Parked

- **FR-006 / FR-012 — Lista nadchodzących wydarzeń (osobny widok)** — Why parked: PRD oznacza jako `nice-to-have`; Dashboard „Dziś" z S-04 pokrywa zbliżoną potrzebę. PRD §Functional Requirements.
- **FR-009 — Cykliczne (powtarzające się) wydarzenia** — Why parked: PRD `nice-to-have`; nieproporcjonalna złożoność (reguły powtarzania, edge cases stref czasowych, edit-this-or-all). PRD §Functional Requirements.
- **FR-010 — Przypomnienia e-mail (1h i 1 dzień przed)** — Why parked: PRD `nice-to-have`; wymaga zewnętrznego workera + integracji SMTP. PRD §Functional Requirements.
- **FR-011 — Widok kalendarza tygodniowy / miesięczny** — Why parked: PRD `nice-to-have`; znaczący przyrost UI poza wedge konfliktu. PRD §Functional Requirements.
- **Wielozasobowa logistyka (kilka aut, rowery, carpool)** — Why parked: PRD §Non-Goals; upraszcza regułę konfliktu do jednej osi w MVP.
- **Integracja z zewnętrznym kalendarzem (Google Calendar, Apple Calendar, iCal)** — Why parked: PRD §Non-Goals; aplikacja jest odizolowanym narzędziem household w MVP.
- **Załączniki i zdjęcia do wydarzeń** — Why parked: PRD §Non-Goals; pola tekstowe wystarczą do MVP.
- **Raportowanie i statystyki (eksport CSV/PDF, analiza wzorców)** — Why parked: PRD §Non-Goals.
- **Onboarding drugiego rodzica do household** — Why parked: Open Question #2 ma `Blokuje: tak`; decyzja produktowa nie podjęta. Wróci do roadmapy po rozstrzygnięciu, jak drugi rodzic dołącza.
- **Usunięcie konta + trwała kaskada danych (NFR)** — Why parked: NFR wiążący jeśli aplikacja idzie publicznie poza własny household. Dla prywatnego użytku household manualne usunięcie przez Supabase Studio jest akceptowalną ścieżką awaryjną. Zaplanuj jako S-NN przed pierwszym publicznym deploymentem.
- **Observability (Sentry / structured logging / metrics)** — Why parked: świadomie odłożone ze względu na `top_blocker: time` i mikro-skalę użytkowników. Wróci do roadmapy, gdy produkt opuści fazę single-household.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — gdy zarchiwizowana zmiana o pasującym `Change ID` zostanie zamknięta.)
