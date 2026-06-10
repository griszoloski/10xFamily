# Foundation: Household + events schema + RLS isolation — Implementation Plan

## Overview

Pierwsza migracja Supabase tego projektu. Zakłada minimalny schemat household (`households` + `household_members` + `household_members_profiles` + `events`), granularne polityki RLS izolujące wszystkie operacje per `household_id`, oraz Postgres trigger `handle_new_user()`, który atomowo z każdą rejestracją w `auth.users` tworzy household, dołącza usera jako pierwszego membera i zasiewa jeden zalążkowy profil. Migracja kończy się blokiem `DO $$ … ASSERT $$`, który smoke-testuje, że user z household B nie widzi danych household A — `supabase db push` failuje, jeśli RLS przepuszcza cross-household. Po stronie TypeScript pojawia się `src/types.ts` z encjami i DTO, na których staną slice'y S-01..S-04.

## Current State Analysis

- **Brak migracji w repo.** Katalog `supabase/migrations/` nie istnieje — to będzie pierwsza migracja projektu. Konwencja nazewnictwa `YYYYMMDDHHmmss_short_description.sql` jest spisana w [AGENTS.md](../../../AGENTS.md) i [CLAUDE.md](../../../CLAUDE.md).
- **Mandat RLS jest twardy.** AGENTS.md *„Always enable RLS on new tables with granular per-operation, per-role policies"* — wybór, że RLS jest włączony i polityki są per-operation, jest settled, nie projektujemy go w tym planie.
- **Supabase config jest gotowy.** [supabase/config.toml](../../../supabase/config.toml) ma `db.migrations.enabled = true`, `db.seed.enabled = true`, lokalny stack startuje przez `npx supabase start` (Docker). `enable_confirmations = false` w `[auth.email]` — rejestracja tworzy usera w `auth.users` natychmiast, bez kroku potwierdzenia maila; to upraszcza weryfikację Phase 3.
- **Signup flow jest minimalny i tego planu nie modyfikuje.** [signup.ts](../../../src/pages/api/auth/signup.ts) wywołuje `supabase.auth.signUp(...)` i redirectuje na `/auth/confirm-email`. Trigger w bazie wykona całą robotę domenową; signup.ts pozostaje bez zmian (poza opcjonalnym typowaniem zwracanego usera, jeśli zajdzie potrzeba, ale jest poza zakresem F-01).
- **`src/types.ts` jeszcze nie istnieje.** AGENTS.md wskazuje go jako miejsce na encje/DTO; F-01 utworzy plik.
- **Brak infrastruktury testowej.** W [package.json](../../../package.json) nie ma Vitest, Playwright ani pgTAP. Decyzja z questioning: weryfikację RLS robi blok `DO $$ … ASSERT $$` wewnątrz migracji — nie wprowadzamy w tym planie żadnego nowego frameworka testowego.
- **Decyzje z roadmapy obowiązują.** F-01 jest minimalnym enablerem dla S-01..S-04 (per [context/foundation/roadmap.md](../../foundation/roadmap.md)). `main_goal: learn` i `top_blocker: time` z roadmapy są bezpośrednim uzasadnieniem decyzji #5 (test RLS od pierwszej linii) i #4a (seed profilu z emaila zamiast osobnego setup-wizard ekranu).

## Desired End State

Po zastosowaniu migracji i restarcie dev-stacku:

1. `npx supabase db reset` przechodzi czysto: schemat + RLS + trigger + smoke test `DO $$ ASSERT $$` zwracają success. Jakikolwiek wyciek cross-household ujawnia się jako FAIL `supabase db reset`/`db push`.
2. Rejestracja świeżego usera przez `/auth/signup` skutkuje pojawieniem się w bazie: jednego rekordu w `households`, jednego w `household_members` (user → ten household), jednego w `household_members_profiles` (`display_name = split_part(email, '@', 1)`, `kind = 'adult'`) — wszystko atomowo (rollback wszystkiego, jeśli któraś operacja padnie).
3. Drugi świeży user dostaje własny, odrębny household; nie widzi w żadnym `select * from <tabela>` rekordów pierwszego (Supabase Studio z zalogowaną drugą sesją).
4. `src/types.ts` eksportuje typy: `Household`, `HouseholdMember`, `HouseholdMemberProfile`, `Event`, `NewEvent`, `EventUpdate` — wszystkie używające `import type` i odpowiadające 1:1 schematowi DB.
5. Slice S-01 (first-event-in-schedule) ma na czym stanąć: tabela `events` istnieje, FK do profilu istnieje, RLS izoluje, typy DTO są zdefiniowane.

### Key Discoveries

- AGENTS.md mandat: granular per-operation, per-role policies → migracja definiuje **osobne polityki SELECT / INSERT / UPDATE / DELETE** dla każdej tabeli, na roli `authenticated`; rola `anon` nie dostaje żadnych polityk (efektywnie zerowy dostęp).
- Supabase pattern „auto-create profile on signup" używa funkcji `SECURITY DEFINER` z jawnym `SET search_path = public, pg_temp` — bez tego footgun bezpieczeństwa (privilege escalation przez `search_path` injection). Plan to wymusza.
- Postgres `tstzrange(starts_at, starts_at + (duration_minutes || ' minutes')::interval)` z operatorem `&&` to natywna ścieżka detekcji konfliktów; F-01 NIE implementuje tej logiki (to S-02), ale schemat (`starts_at timestamptz` + `duration_minutes integer > 0` + `car_needed boolean` + częściowy index `where car_needed`) jest dobrany pod to wcześniejsze.
- Blok `DO $$ … ASSERT $$ LANGUAGE plpgsql` może symulować dwie sesje user'ów przez `SET LOCAL request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'::text` i `SET LOCAL role = authenticated`. To ścieżka, której Supabase docs używają w przykładach RLS testing.

## What We're NOT Doing

- **Nie modyfikujemy żadnego ekranu UI ani React/Astro komponentu.** F-01 jest backend-only foundation. Wszystko UI należy do S-01..S-04.
- **Nie modyfikujemy signup.ts ani innych API route'ów auth.** Cała logika domenowa rejestracji idzie w trigger DB.
- **Nie implementujemy onboardingu drugiego rodzica** (zaproszenia, accept-invite, multi-member household). Parked w roadmapie (Open Question #2). Architektura wybrana dziś (`households` + join table) ZOSTAWIA tę ścieżkę tanią, ale jej nie buduje.
- **Nie implementujemy algorytmu detekcji konfliktów.** To S-02 (north star). Schemat jest dobrany, żeby ten algorytm był krótki, ale logika nie powstaje tu.
- **Nie wprowadzamy Vitest / Playwright / pgTAP.** Weryfikacja RLS żyje w bloku ASSERT w migracji. Infrastruktura testowa pojawi się w pierwszym slice, który jej realnie potrzebuje (najpewniej S-02 dla unit-testów algorytmu konfliktów).
- **Nie naprawiamy istniejącej niespójności** między `enable_confirmations = false` w config.toml a redirectem signup.ts na `/auth/confirm-email`. Poza zakresem F-01.
- **Nie implementujemy soft-delete dla `events`** (`deleted_at`). PRD i roadmap S-03 zostawiają tę decyzję jako Unknown — F-01 robi hard delete via cascade z `households`/`household_members_profiles`.
- **Nie dodajemy `display_name` edit screen ani innego UI do edycji profilu.** Seed profilu z `email` jest świadomie „brzydki" w MVP — ekran edycji to późniejszy slice.
- **Nie dodajemy kolumn pod cykliczność, przypomnienia, kategorie.** Schemat jest celowo minimalny per F-01 Outcome z roadmapy.

## Implementation Approach

Wszystko load-bearing dzieje się w **jednym pliku migracji SQL**. Ten plik jest atomowy z definicji (Postgres transakcja per migration) — albo cały schemat + trigger + smoke test landuje, albo nic. Phase 2 (TypeScript) jest defensywna: tworzy typy DTO/encji, żeby slice'y S-01..S-04 nie zaczynały od „a co jest w bazie". Phase 3 jest manualnym verification gate'em — bo F-01 to fundament, na którym staną wszystkie kolejne slice'y; pomyłka tutaj jest droga.

Kolejność wewnątrz migracji (raz dla całości): (1) tabele w kolejności zależności FK, (2) indeksy, (3) `alter table … enable row level security` na każdej, (4) polityki per-operation per-role, (5) funkcja `handle_new_user()` + trigger, (6) blok `DO $$ ASSERT $$` smoke test RLS.

## Critical Implementation Details

- **`security definer` + `set search_path`.** Funkcja `handle_new_user()` MUSI mieć `SECURITY DEFINER` (bo działa w kontekście triggera na `auth.users`, do której role `authenticated` nie ma dostępu) ORAZ `SET search_path = public, pg_temp`. Bez `SET search_path` privilege escalation przez podstawienie tabeli w schemacie kontrolowanym przez atakującego — znany Supabase footgun. To jest jedyna rzecz w tej migracji, którą można źle napisać i mieć problem bezpieczeństwa zamiast bug'a funkcjonalnego.
- **Smoke test resetuje swój własny stan.** Blok `DO $$ … $$` na końcu migracji robi insert + assert + delete, opakowany w `SAVEPOINT` / `ROLLBACK TO SAVEPOINT`, żeby ślady testowych danych nie zostały w bazie produkcyjnej po `db push`. Bez tego pierwszy realny user dostałby pre-seeded test data.
- **Sequencing dla triggera.** Trigger MUSI być `AFTER INSERT` na `auth.users` (nie `BEFORE`) — żeby `new.id` był stabilny i żeby polityka RLS nie blokowała inserta w `auth`. Insert do `households`/`household_members`/`household_members_profiles` w funkcji idzie bez RLS check, bo SECURITY DEFINER widzi politykę z perspektywy ownera funkcji (postgres role), nie wywołującego.

## Phase 1: Migracja SQL — schemat, RLS, trigger, smoke test

### Overview

Tworzy jedną nową migrację `supabase/migrations/<timestamp>_household_events_foundation.sql` zawierającą cały schemat, polityki RLS, trigger i smoke test. To 90% pracy F-01.

### Changes Required

#### 1. Plik migracji SQL

**File**: `supabase/migrations/20260610112151_household_events_foundation.sql`

**Intent**: Założyć minimalny schemat danych F-01 z izolacją per household od linii pierwszej. Wszystko atomowo w jednej migracji.

**Contract**: Migracja definiuje:

- **Tabela `households`**: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`.
- **Tabela `household_members`**: `household_id uuid not null references households(id) on delete cascade`, `user_id uuid not null references auth.users(id) on delete cascade`, `joined_at timestamptz not null default now()`, primary key `(household_id, user_id)`. Index `(user_id)` dla szybkiego lookup w politykach RLS.
- **Tabela `household_members_profiles`**: `id uuid primary key default gen_random_uuid()`, `household_id uuid not null references households(id) on delete cascade`, `display_name text not null check (length(trim(display_name)) > 0)`, `kind text not null check (kind in ('adult','child')) default 'adult'`, `created_at timestamptz not null default now()`. Index `(household_id)`.
- **Tabela `events`**: `id uuid primary key default gen_random_uuid()`, `household_id uuid not null references households(id) on delete cascade`, `subject_id uuid not null references household_members_profiles(id) on delete restrict`, `driver_id uuid references household_members_profiles(id) on delete restrict` (nullable), `title text not null check (length(trim(title)) > 0)`, `starts_at timestamptz not null`, `duration_minutes integer not null check (duration_minutes > 0)`, `location text`, `notes text`, `car_needed boolean not null default false`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. Index `(household_id, starts_at)` dla list i konfliktów. Częściowy index `(household_id, starts_at) where car_needed` dla algorytmu S-02. Constraint sanity: gdy `car_needed = false`, `driver_id` musi być `null` (lub odwrotnie — opcjonalnie, ale czyste).
- **RLS włączone na wszystkich 4 tabelach** (`alter table … enable row level security`).
- **Polityki per-operation, per-role**:
  - `households`: SELECT na `authenticated` używa `id in (select household_id from household_members where user_id = auth.uid())`. INSERT/UPDATE/DELETE: brak polityki (rola `authenticated` nie tworzy household — to robi trigger jako `postgres`). Rola `anon`: zero polityk.
  - `household_members`, `household_members_profiles`, `events`: SELECT/INSERT/UPDATE/DELETE na `authenticated` używa `household_id in (select household_id from household_members where user_id = auth.uid())` w `using` i `with check` odpowiednio. `INSERT` ma tylko `with check`; `SELECT`/`DELETE` mają tylko `using`; `UPDATE` ma oba.
- **Funkcja `public.handle_new_user()` `returns trigger language plpgsql security definer set search_path = public, pg_temp`**: w jednym bloku wstawia nowy `households` (zapamiętuje `new_household_id`), `household_members (new_household_id, new.id)`, `household_members_profiles (new_household_id, split_part(new.email, '@', 1), 'adult')`, zwraca `new`.
- **Trigger `on_auth_user_created` AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`.**
- **Smoke test RLS — blok `DO $$ … $$ LANGUAGE plpgsql`**:
  - Tworzy `SAVEPOINT before_smoke`.
  - Insertuje dwóch fake'owych userów do `auth.users` (z generowanymi UUID), co odpala trigger i tworzy dwa odrębne households + members + profiles.
  - W jednej sesji ustawia `SET LOCAL role = authenticated` + `SET LOCAL request.jwt.claims = '{"sub":"<user_A_uuid>","role":"authenticated"}'`, wstawia event w household A. ASSERT: `(select count(*) from events) = 1` (user A widzi swój event).
  - Resetuje claims na user B, ASSERT: `(select count(*) from events) = 0` (user B nie widzi nic).
  - ASSERT: `(select count(*) from households) = 1` z perspektywy user B (widzi tylko swój).
  - `ROLLBACK TO SAVEPOINT before_smoke` — czysci wszystkie testowe dane.

Pełny SQL jest do napisania przez implementatora; powyższe to kontrakt. Jeden non-obvious fragment, który warto utrwalić w planie, bo łatwo go pominąć:

```sql
-- Funkcja triggera MUSI mieć security definer + set search_path
-- (bez tego znany Supabase footgun: privilege escalation via search_path).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_household_id uuid;
begin
  insert into public.households default values returning id into new_household_id;
  insert into public.household_members (household_id, user_id)
    values (new_household_id, new.id);
  insert into public.household_members_profiles (household_id, display_name, kind)
    values (new_household_id, split_part(new.email, '@', 1), 'adult');
  return new;
end;
$$;
```

### Success Criteria

#### Automated Verification

- Migracja aplikuje się czysto: `npx supabase db reset` kończy z exit code 0
- Blok ASSERT w migracji nie wyrzuca błędu (jeśli RLS przecieka, `db reset` failuje)
- Lint przechodzi bez nowych ostrzeżeń: `npm run lint`
- Build wciąż przechodzi: `npm run build` (smoke test, że nic w pipeline'ie się nie wywróciło)

#### Manual Verification

- Po `npx supabase db reset` w Supabase Studio (`http://127.0.0.1:54323`) widać 4 nowe tabele: `households`, `household_members`, `household_members_profiles`, `events`
- W zakładce „Authentication" → „Policies" każda z 4 tabel ma włączone RLS i listę polityk per-operation (SELECT/INSERT/UPDATE/DELETE) dla roli `authenticated`
- Brak rekordów testowych w żadnej tabeli po `db reset` (smoke test po sobie posprzątał)

**Implementation Note**: Po zakończeniu Phase 1 i wszystkich automated verification, pauza na manualne potwierdzenie (Studio + brak rezydualnych testów) przed przejściem do Phase 2.

---

## Phase 2: Wiring TypeScript — `src/types.ts`

### Overview

Tworzy `src/types.ts` z encjami i DTO odpowiadającymi 1:1 schematowi z Phase 1. To umożliwia S-01..S-04 typowane CRUD'y bez zaczynania od zera.

### Changes Required

#### 1. Encje i DTO

**File**: `src/types.ts`

**Intent**: Dać slice'om S-01..S-04 typed surface nad schematem F-01: cztery typy encji (jeden-do-jeden z tabelami) i dwa pomocnicze DTO dla operacji CRUD na `events`.

**Contract**: Eksportuje:

- `Household` — `{ id: string; created_at: string; }`
- `HouseholdMember` — `{ household_id: string; user_id: string; joined_at: string; }`
- `HouseholdMemberProfile` — `{ id: string; household_id: string; display_name: string; kind: "adult" | "child"; created_at: string; }`
- `Event` — `{ id: string; household_id: string; subject_id: string; driver_id: string | null; title: string; starts_at: string; duration_minutes: number; location: string | null; notes: string | null; car_needed: boolean; created_at: string; updated_at: string; }`
- `NewEvent` — `Omit<Event, "id" | "household_id" | "created_at" | "updated_at">` (DTO dla S-01: insert; `household_id` ustawiany serwerowo z `household_members`).
- `EventUpdate` — `Partial<NewEvent>` (DTO dla S-03).

Brak runtime kodu w tym pliku — same `export type … = …;`. Per AGENTS.md walidacja boundary leci przez Zod w slice'ach S-01..S-04, nie w `src/types.ts`.

Plik nie używa wygenerowanego `supabase gen types` (intencjonalnie — F-01 trzyma typy ręcznie pisane jako kontrakt; auto-generated types mogą wejść w późniejszym slice, gdy schemat się ustabilizuje przez kilka migracji).

### Success Criteria

#### Automated Verification

- TypeScript przechodzi bez błędów: `npm run lint` (uruchamia eslint z type-checked rules per [AGENTS.md](../../../AGENTS.md))
- Build przechodzi: `npm run build`
- `src/types.ts` istnieje i ma 6 eksportów: `Household`, `HouseholdMember`, `HouseholdMemberProfile`, `Event`, `NewEvent`, `EventUpdate`

#### Manual Verification

- Otwarcie pliku w edytorze pokazuje czysty Intellisense bez squigglies
- Próbny import w dev: `import type { Event } from "@/types";` w dowolnym pliku z `src/` rozpoznaje typ

**Implementation Note**: Po zakończeniu Phase 2 i automated verification, pauza na manualne potwierdzenie przed przejściem do Phase 3.

---

## Phase 3: Weryfikacja end-to-end z UI rejestracji

### Overview

Bez nowego kodu. Manualny verification gate: rejestracja w dev → kontrola w Supabase Studio, że trigger wszystko utworzył poprawnie, plus drugie konto → kontrola izolacji RLS w Studio z drugą sesją. To jest finalna brama, bo F-01 to fundament dla wszystkich downstream slice'ów.

### Changes Required

Żadnych zmian w kodzie. Tylko verification.

### Success Criteria

#### Automated Verification

- (Brak — Phase 3 jest w pełni manualna)

#### Manual Verification

- `npm run dev` startuje czysto; `npx supabase start` ma running stack
- Rejestracja przez `/auth/signup` pierwszego usera (np. `alice@example.test`) przechodzi bez błędu i landuje na `/auth/confirm-email` (istniejący redirect — wiadomo, że nie do naprawy w F-01)
- W Supabase Studio: `select * from households` → 1 rekord; `select * from household_members` → 1 rekord z `user_id` Alice; `select * from household_members_profiles` → 1 rekord z `display_name = 'alice'`
- Rejestracja drugiego usera (`bob@example.test`) — w Studio: `households` ma 2 rekordy, `household_members_profiles` ma 2 (`alice`, `bob`), każde w swoim household
- W Studio SQL editor z rolą `authenticated` symulującą JWT Alice: `select * from household_members_profiles` zwraca tylko rekord Alice; analogicznie dla Boba — żadnych wycieków cross-household
- Wstawienie testowego eventu przez Alice (w Studio z jej JWT) → Alice widzi, Bob nie widzi
- `git status` pokazuje tylko 2 zmodyfikowane / nowe pliki: `supabase/migrations/<…>.sql` i `src/types.ts` (zero collateral damage)

**Implementation Note**: Phase 3 to ostatnia brama F-01 — żaden downstream slice (S-01..S-04) nie powinien startować, jeśli ten phase nie został potwierdzony manualnie.

---

## Testing Strategy

### Unit Tests

- F-01 NIE wprowadza unit tests. PRD/roadmap explicite nie wymagają, a wprowadzenie Vitest rozszerzyłoby scope foundation poza minimum. Pierwszy unit test pojawi się w S-02 (algorytm konfliktów) gdy będzie pierwsza realna potrzeba.

### Integration Tests

- Smoke test RLS żyje w samej migracji jako blok `DO $$ ASSERT $$` — wykonywany przy każdym `npx supabase db reset` / `db push`. To jest jedyny zautomatyzowany test F-01 i jest celowo wystarczający dla foundation tej skali.

### Manual Testing Steps

1. `npx supabase db reset` — czysto, bez błędów ASSERT.
2. `npm run dev` + drugi terminal `npx supabase status` — wszystko healthy.
3. Rejestracja Alice → kontrola 3 tabel w Studio.
4. Rejestracja Boba → kontrola, że oba households są izolowane.
5. Wstawienie eventu w jednej sesji, próba odczytu w drugiej — cross-household nie widać.
6. `select count(*) from auth.users` — 2; `select count(*) from households` — 2; relacja 1:1 zachowana.

## Performance Considerations

Niska skala (`target_scale: small` w PRD). Polityki RLS używają subquery `select household_id from household_members where user_id = auth.uid()` — Postgres potrafi to zinline'ować, ale dla pewności index `(user_id)` na `household_members` jest jawnie zakładany. Index `(household_id, starts_at)` na `events` plus częściowy `where car_needed` to przygotowanie pod S-02 i S-04 (sortowanie i filtrowanie po dniu). Cloudflare Workers 128MB limit nie jest tu zagrożeniem — Phase 3 nie wstawia danych w masie, a downstream slice'y muszą same paginować zapytania (już zapisane w `Risk` S-04 w roadmapie).

## Migration Notes

- Greenfield migration — brak danych do zmigrowania.
- Forward-compat z onboardingiem drugiego rodzica (Parked w roadmapie): wystarczy dorzucić `insert into household_members (household_id, user_id) values (target_household_id, new_user_id)` w przyszłej accept-invite ścieżce. Schemat F-01 nie wymaga żadnych zmian dla multi-member household — to było główne uzasadnienie wyboru join-table modelu w decyzji #1.
- Rollback: `supabase migration repair --status reverted <timestamp>` + ręczny `drop table … cascade` dla 4 tabel + `drop function public.handle_new_user() cascade` (cascade usuwa też trigger). Per [infrastructure.md](../../foundation/infrastructure.md) Supabase migracje NIE rollbackują się automatycznie — trzeba pamiętać.

## References

- Roadmap F-01: [context/foundation/roadmap.md](../../foundation/roadmap.md) (sekcja `## Foundations` → `### F-01`)
- PRD: [context/foundation/prd.md](../../foundation/prd.md) (FR-001, FR-002, FR-003, NFR izolacja household, Access Control)
- Change identity: [context/changes/events-schema-and-rls/change.md](./change.md)
- Tech stack: [context/foundation/tech-stack.md](../../foundation/tech-stack.md) (Supabase + RLS jako mandat)
- Infrastructure ryzyka: [context/foundation/infrastructure.md](../../foundation/infrastructure.md) (Cloudflare Workers limits, rollback nie-automatyczny)
- Repo conventions: [AGENTS.md](../../../AGENTS.md), [CLAUDE.md](../../../CLAUDE.md) (naming convention migracji, RLS mandate, types.ts location)
- Istniejący signup flow (referencyjny, niemodyfikowany): [src/pages/api/auth/signup.ts](../../../src/pages/api/auth/signup.ts), [src/lib/supabase.ts](../../../src/lib/supabase.ts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja SQL — schemat, RLS, trigger, smoke test

#### Automated

- [x] 1.1 Migracja aplikuje się czysto: `npx supabase db reset` kończy z exit code 0 — 7488e4a
- [x] 1.2 Blok ASSERT w migracji nie wyrzuca błędu (jeśli RLS przecieka, `db reset` failuje) — 7488e4a
- [x] 1.3 Lint przechodzi bez nowych ostrzeżeń: `npm run lint` — 7488e4a
- [x] 1.4 Build wciąż przechodzi: `npm run build` — 7488e4a

#### Manual

- [x] 1.5 Po `npx supabase db reset` w Supabase Studio widać 4 nowe tabele: `households`, `household_members`, `household_members_profiles`, `events` — 7488e4a
- [x] 1.6 W zakładce „Authentication" → „Policies" każda z 4 tabel ma włączone RLS i listę polityk per-operation dla roli `authenticated` — 7488e4a
- [x] 1.7 Brak rekordów testowych w żadnej tabeli po `db reset` — 7488e4a

### Phase 2: Wiring TypeScript — `src/types.ts`

#### Automated

- [x] 2.1 TypeScript przechodzi bez błędów: `npm run lint`
- [x] 2.2 Build przechodzi: `npm run build`
- [x] 2.3 `src/types.ts` istnieje i ma 6 eksportów: `Household`, `HouseholdMember`, `HouseholdMemberProfile`, `Event`, `NewEvent`, `EventUpdate`

#### Manual

- [x] 2.4 Otwarcie pliku w edytorze pokazuje czysty Intellisense bez squigglies
- [x] 2.5 Próbny import w dev: `import type { Event } from "@/types";` rozpoznaje typ

### Phase 3: Weryfikacja end-to-end z UI rejestracji

#### Manual

- [ ] 3.1 `npm run dev` startuje czysto; `npx supabase start` ma running stack
- [ ] 3.2 Rejestracja przez `/auth/signup` pierwszego usera przechodzi bez błędu
- [ ] 3.3 Studio: po rejestracji Alice — 1 household, 1 household_member z user_id Alice, 1 profile `display_name = 'alice'`
- [ ] 3.4 Rejestracja drugiego usera (Bob) — 2 households, 2 profiles (alice, bob), każde w swoim household
- [ ] 3.5 Studio SQL z JWT Alice: `select * from household_members_profiles` zwraca tylko Alice; analogicznie Bob — brak wycieków
- [ ] 3.6 Wstawienie eventu w Studio z JWT Alice → Alice widzi, Bob nie widzi
- [ ] 3.7 `git status` pokazuje tylko 2 nowe/zmodyfikowane pliki: `supabase/migrations/<…>.sql` i `src/types.ts`
