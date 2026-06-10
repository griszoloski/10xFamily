# Foundation: Household + events schema + RLS isolation — Plan Brief

> Full plan: [context/changes/events-schema-and-rls/plan.md](./plan.md)
> Roadmap item: [context/foundation/roadmap.md](../../foundation/roadmap.md) (F-01)

## What & Why

Realizuje F-01 z roadmapy — zakłada pierwszą migrację Supabase tego projektu i daje wszystkim downstream slice'om (S-01..S-04) twardy kontrakt warstwy danych: minimalny schemat household, granularne polityki RLS izolujące dane per household od linii pierwszej (mandat PRD NFR „izolacja household od dnia 1" + mandat AGENTS.md), oraz atomowy mechanizm tworzenia household przy każdej rejestracji. Foundation, nie slice — bez tego żaden user-facing slice nie ruszy bezpiecznie.

## Starting Point

Repo ma działający Supabase SSR auth (signup/signin/signout w [src/pages/api/auth/](../../../src/pages/api/auth/), middleware z `PROTECTED_ROUTES` w [src/middleware.ts](../../../src/middleware.ts), klient w [src/lib/supabase.ts](../../../src/lib/supabase.ts)), `supabase/config.toml` z włączonym `db.migrations`, oraz `wrangler.jsonc` pod Cloudflare Workers. Brakuje katalogu `supabase/migrations/` (to będzie pierwsza migracja), brakuje `src/types.ts`, brakuje jakiegokolwiek schematu domenowego. Reszta stacku (Astro 6 + React 19 + Tailwind 4 + shadcn/ui) jest gotowa i niezmieniana w tym planie.

## Desired End State

Po zastosowaniu migracji każda rejestracja przez `/auth/signup` atomowo tworzy: nowy household, członkostwo usera w nim i zalążkowy profil z `display_name` wyderywowanym z emaila. Cztery tabele (`households`, `household_members`, `household_members_profiles`, `events`) mają włączone RLS z politykami per-operation; dwóch userów w dwóch household nie widzi nawzajem żadnych danych. Blok ASSERT w samej migracji failuje `supabase db push`, jeśli ktoś w przyszłości naruszy izolację. `src/types.ts` daje S-01..S-04 typed surface nad schematem.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Household model | Dedykowana `households` + join table `household_members` | Forward-compat z onboardingiem drugiego rodzica (Parked) bez migracji danych w przyszłości | Plan |
| Tworzenie household | Postgres trigger `handle_new_user()` SECURITY DEFINER na `auth.users` insert | Atomowo z rejestracją — żadna droga (signup/OAuth/magic-link) nie może o tym zapomnieć | Plan |
| Czas wydarzenia | `starts_at timestamptz` + `duration_minutes integer` | Czyste TZ + `tstzrange &&` operator dla S-02 daje krótki algorytm konfliktów | Plan |
| „Osoba/dziecko" w events | Osobna tabela `household_members_profiles` z FK `subject_id` + `driver_id` | User świadomie wybrał spójność profili nad minimalizmem tekstowych etykiet | Plan |
| Pierwszy profil w household | Trigger seeduje 1 profil z `display_name = split_part(email, '@', 1)` | Nie wprowadza setup-wizard ekranu w F-01; edycja `display_name` to późniejszy slice | Plan |
| Weryfikacja RLS | Smoke test jako blok `DO $$ … ASSERT $$` w samej migracji | `main_goal: learn` wymusza świadomy RLS od linii pierwszej, bez wprowadzania Vitest/pgTAP w F-01 | Plan |
| Hard vs soft delete | Hard delete via FK `on delete cascade` z `households` | PRD nie precyzuje; odłożone do S-03 jeśli się okaże potrzebne | Roadmap |

## Scope

**In scope:**
- Migracja SQL: schemat 4 tabel + indeksy + RLS + polityki per-operation per-role + trigger + smoke test ASSERT.
- `src/types.ts`: 6 typed eksportów (encje + DTO dla CRUD na events).
- Manualna weryfikacja end-to-end (rejestracja Alice/Bob → kontrola izolacji w Studio).

**Out of scope:**
- Modyfikacje signup.ts / signin.ts / signout.ts / middleware.ts (zero zmian).
- Jakiekolwiek UI / React / Astro components.
- Algorytm detekcji konfliktów (S-02).
- Onboarding drugiego rodzica, zaproszenia, multi-member household (Parked).
- Vitest / Playwright / pgTAP / jakikolwiek nowy framework testowy.
- Soft delete dla events, kolumny pod cykliczność/przypomnienia/kategorie.
- Edit screen dla `display_name` profilu (pierwszy zalążkowy profil zostaje „brzydki" w MVP).
- Naprawa istniejącej niespójności `enable_confirmations = false` vs redirect na `/auth/confirm-email`.

## Architecture / Approach

Jeden plik migracji robi 90% pracy:

```
auth.users (Supabase Auth)
    │  AFTER INSERT trigger
    ▼
handle_new_user() [SECURITY DEFINER, search_path = public, pg_temp]
    │
    ├─→ households (1 nowy rekord)
    ├─→ household_members (user → ten household)
    └─→ household_members_profiles (1 profil, display_name z emaila, kind=adult)

events ──FK──→ households, household_members_profiles (subject + driver)

RLS na 4 tabelach: per-operation, per-role policies dla `authenticated`;
filtrowanie via `household_id in (select household_id from household_members where user_id = auth.uid())`

Smoke test w migracji: DO $$ … ASSERT cross-household isolation … $$
opakowany w SAVEPOINT/ROLLBACK żeby nie zostawiać śladów.
```

`src/types.ts` daje TS warstwę nad schematem; signup.ts pozostaje niezmieniony, bo cała logika domenowa rejestracji żyje w triggerze DB.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migracja SQL | Schemat 4 tabel + RLS + trigger + smoke test ASSERT w jednym pliku | `SECURITY DEFINER` bez `SET search_path` = privilege escalation (znany Supabase footgun) — plan to wymusza w „Critical Implementation Details" |
| 2. Wiring TypeScript | `src/types.ts` z 6 eksportami (encje + DTO) | Brak — czysto deklaratywny, type-only |
| 3. Weryfikacja end-to-end | Manual gate: rejestracja Alice/Bob → kontrola izolacji w Studio | Manualny krok — łatwo go pominąć; plan to bramuje przed startem S-01 |

**Prerequisites:** Docker zainstalowany lokalnie (`npx supabase start`), `.env` / `.dev.vars` z `SUPABASE_URL` i `SUPABASE_KEY` per [AGENTS.md](../../../AGENTS.md).

## Open Risks & Assumptions

- Trigger SECURITY DEFINER bez `set search_path` = wyciek privilege escalation. Plan to flaguje w Critical Implementation Details i utrwala w przykładowym SQL, ale implementer musi pamiętać.
- Smoke test ASSERT używa `SET LOCAL request.jwt.claims` — to działa w transakcji migracji, ale gdyby kiedyś Supabase zmienił mechanikę JWT (uchylił `request.jwt.claims` na rzecz nowego API), test trzeba przepisać. Akceptowalne ryzyko dla MVP.
- Smoke test po sobie sprząta przez `ROLLBACK TO SAVEPOINT`. Jeśli sprzątanie zawiedzie (mało prawdopodobne — Postgres jest tu deterministyczny), świeże dev DB miałoby śmieci po `db reset`. Manual verification 3.7 (`git status` / Studio kontrola pustych tabel) łapie to.
- Hard delete via cascade na `households` — usunięcie household kasuje wszystkie events. Świadome dla MVP; gdy odmrozisz „usunięcie konta + trwała kaskada" (NFR, Parked), będzie i tak chcieć tego zachowania.

## Success Criteria (Summary)

- Świeży `npx supabase db reset` przechodzi czysto z bloku ASSERT (zielony znacznik RLS isolation working).
- Rejestracja w `/auth/signup` powoduje pojawienie się 1+1+1 rekordów (household + member + profile) atomowo.
- Druga rejestracja → drugi izolowany household; user A i user B nie widzą nawzajem żadnych danych w żadnej z 4 tabel.
- S-01 (first-event-in-schedule) ma na czym stanąć: tabela `events`, FK do profilu, typowy `NewEvent` DTO, RLS chroni cross-household insert.
