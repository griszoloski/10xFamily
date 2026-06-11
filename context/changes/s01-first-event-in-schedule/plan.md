# S-01: Pierwsze wydarzenie w harmonogramie — Plan implementacji

## Overview

Implementuje pełny przepływ „dodaj wydarzenie i zobacz je na liście": serwis DB, endpoint POST `/api/events`, strona listy `/events`, formularz React `/events/new` i link z dashboardu. Po tej zmianie zalogowany rodzic może dodać swoje pierwsze wydarzenie i zobaczyć je na ekranie bez żadnego inżynierskiego pośrednictwa.

## Current State Analysis

- **Schema DB (F-01 ✓):** tabele `events`, `household_members`, `household_members_profiles` istnieją z RLS — `household_id` izolowane per user. Kontrakt w `supabase/migrations/20260610112151_household_events_foundation.sql`.
- **Typy TS (F-01 ✓):** `Event`, `NewEvent`, `HouseholdMemberProfile` gotowe w `src/types.ts`.
- **Wzorzec API routes:** `src/pages/api/auth/signup.ts` — `POST: APIRoute`, `formData()`, redirect po błędzie/sukcesie.
- **Wzorzec React form:** `src/components/auth/SignUpForm.tsx` — controlled inputs, client-side validate, `<form method="POST">`.
- **Wzorzec SSR + auth:** `src/pages/dashboard.astro` — Astro frontmatter pobiera dane, `Astro.locals.user` z middleware.
- **Brakuje:** żadnego endpointu eventów, serwisu, formularza ani listy.

## Desired End State

Zalogowany użytkownik klika „Moje wydarzenia" na dashboardzie, trafia na `/events` (lista wszystkich eventów household, sortowana malejąco), klika „Dodaj wydarzenie", wypełnia formularz na `/events/new`, po sukcesie wraca na `/events` z komunikatem potwierdzającym i widzi nowy event na liście.

### Key Discoveries

- `subject_id` i `driver_id` to FK do `household_members_profiles` — formularz musi pobierać profile server-side (Astro frontmatter) i przekazywać jako props do React Islandy; nie wolno polegać na UUID wpisanym ręcznie.
- `household_id` ustawiany serwerowo: serwis pyta `household_members WHERE user_id = auth.uid()` — nie z frontendu.
- DB constraint `events_driver_only_when_car_needed` wymusi NULL na `driver_id` gdy `car_needed = false`; serwis powinien to samo wymusić wcześniej, żeby dać czytelny błąd.
- Lista potrzebuje JOIN z `household_members_profiles` po `subject_id` i `driver_id`, żeby wyświetlić imię — nie sam UUID. Supabase JS obsługuje zagnieżdżone selects po FK; query jest nieoczywiste (patrz Phase 2 Contract).
- `checkbox` niezaznaczony nie wysyła pola w `formData` — Zod musi `z.coerce.boolean().default(false)`.
- `date` + `time` to dwa osobne HTML inputy — łączone server-side w `starts_at` (`${date}T${time}:00`); MVP nie robi konwersji timezone (household = jeden timezone).
- `/events` i `/events/new` muszą trafić do `PROTECTED_ROUTES` w middleware.

## What We're NOT Doing

- Paginacja listy — MVP, mała skala.
- Edycja i usuwanie — S-03.
- Detekcja konfliktu na formularzu — S-02.
- Walidacja unikalności events w tym samym czasie — S-02.
- Integracja z dashboardem „Dziś" — S-04.
- Obsługa wielu aut / zasobów — Non-Goal PRD.
- Timezone conversion — MVP.

## Implementation Approach

Trzy fazy w porządku zależności: (1) backend — serwis + endpoint, możliwy do przetestowania przez curl/Studio niezależnie od UI; (2) strona listy `/events`; (3) formularz `/events/new` + domknięcie UX przez link na dashboardzie. Każda faza kończy się lint + build przed przejściem dalej.

## Critical Implementation Details

**Zod schema dla POST /api/events — nieoczywiste coercions:**

```ts
const newEventSchema = z.object({
  title:            z.string().min(1).max(200).trim(),
  subject_id:       z.string().uuid(),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time:             z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().int().min(1).max(1440),
  location:         z.string().max(300).optional(),
  notes:            z.string().max(2000).optional(),
  car_needed:       z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false),
  driver_id:        z.string().uuid().nullable().optional(),
});
```

`car_needed` w formData: zaznaczony = `"on"`, niezaznaczony = pole nieobecne. `z.preprocess` normalizuje oba przypadki.  
`starts_at` jest obliczane po parse: `` `${date}T${time}:00` `` — nie wchodzi do schematu jako osobne pole.

**JOIN z profilami na liście:**

```ts
supabase
  .from("events")
  .select(`
    *,
    subject:household_members_profiles!subject_id(id, display_name, kind),
    driver:household_members_profiles!driver_id(id, display_name)
  `)
  .order("starts_at", { ascending: false })
```

`!subject_id` i `!driver_id` to hint do Supabase, który FK użyć przy zagnieżdżonym select (wymagane gdy tabela ma dwa FK do tej samej tabeli nadrzędnej).

---

## Phase 1: Serwis events + endpoint POST

### Overview

Tworzy `src/lib/services/events.ts` z logiką DB i `src/pages/api/events/index.ts` jako endpoint przyjmujący formData. Po tej fazie backend jest przetestowalny niezależnie od UI (np. przez Studio lub curl).

### Changes Required

#### 1. Serwis eventów

**File:** `src/lib/services/events.ts`

**Intent:** Izolować całą logikę Supabase dla events w jednym miejscu — trzy eksporty: `getHouseholdId`, `createEvent`, `listEvents`. API route i strony Astro nie wywołują Supabase bezpośrednio.

**Contract:** Trzy eksportowane funkcje przyjmują `SupabaseClient` z `@supabase/supabase-js` jako pierwszy argument:

- `getHouseholdId(supabase)` → `Promise<string | null>` — SELECT `household_id` FROM `household_members` WHERE `user_id = auth.uid()` LIMIT 1. RLS gwarantuje widoczność tylko własnego rekordu.
- `createEvent(supabase, householdId, newEvent: NewEvent)` → `Promise<Event>` — INSERT do `events` z `{ ...newEvent, household_id }`. Jeśli `car_needed === false`, wymusza `driver_id: null` przed insertem.
- `listEvents(supabase)` → `Promise<EventWithProfiles[]>` — SELECT z JOIN per wzorzec w "Critical Implementation Details". Typ `EventWithProfiles` to `Event & { subject: Pick<HouseholdMemberProfile, "id" | "display_name" | "kind">, driver: Pick<HouseholdMemberProfile, "id" | "display_name"> | null }` — zdefiniowany lokalnie w tym pliku i re-eksportowany.

#### 2. Endpoint POST /api/events

**File:** `src/pages/api/events/index.ts`

**Intent:** Przyjąć formData z formularza, walidować Zod, zapisać przez serwis, wrócić redirect. Wzorzec identyczny z `signup.ts`.

**Contract:** Eksportuje `POST: APIRoute`. Sekwencja:
1. `createClient` → null guard → redirect `/events/new?error=Supabase+not+configured`.
2. `request.formData()` → `Object.fromEntries(formData)` → parse przez `newEventSchema` (schema z Critical Implementation Details); przy błędzie Zod → redirect `/events/new?error=<first_issue_message>`.
3. Ze sparsowanego obiektu: `starts_at = `${date}T${time}:00``, `driver_id` wymuszony null gdy `car_needed === false`.
4. `getHouseholdId` → null guard → redirect z błędem.
5. `createEvent` → redirect `/events?success=1`.

#### 3. Aktualizacja PROTECTED_ROUTES

**File:** `src/middleware.ts`

**Intent:** Chronić nowe strony `/events` i `/events/new` przed nieautoryzowanym dostępem.

**Contract:** Dodać `"/events"` do tablicy `PROTECTED_ROUTES`. Dopasowanie `startsWith` w middleware obejmie też `/events/new`.

### Success Criteria

#### Automated Verification

- `src/lib/services/events.ts` istnieje i eksportuje `getHouseholdId`, `createEvent`, `listEvents`, `EventWithProfiles`
- `src/pages/api/events/index.ts` istnieje i eksportuje `POST`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification

- POST na `/api/events` z poprawnym formData (przez curl lub bezpośredni submit formularza w przyszłej fazie) → event pojawia się w Supabase Studio w tabeli `events`
- POST z brakującym `title` → redirect na `/events/new?error=...` (weryfikacja URL w przeglądarce)

**Implementation Note:** Po ukończeniu Phase 1 i przejściu wszystkich automated + manual testów, pauza przed Phase 2.

---

## Phase 2: Strona listy /events

### Overview

Tworzy `src/pages/events/index.astro` — SSR strona z listą wszystkich eventów household. Musi działać niezależnie od formularza (liste można wypełnić przez Studio).

### Changes Required

#### 1. Strona listy eventów

**File:** `src/pages/events/index.astro`

**Intent:** Wyświetlić wszystkie eventy zalogowanego rodzica w porządku malejącym (najnowszy na górze), z nazwiskami osób zamiast UUID-ów, komunikatem sukcesu przy `?success=1` i przyciskiem „Dodaj wydarzenie".

**Contract:** Astro frontmatter:
- `createClient` → `listEvents(supabase)` → tablica `EventWithProfiles[]`.
- `const successMsg = Astro.url.searchParams.get("success") === "1"`.
- Renderuje listę eventów. Na każdej pozycji: tytuł, `starts_at` sformatowane jako `dd.MM.yyyy HH:mm`, czas trwania, `subject.display_name`, flaga auta (`car_needed`), `driver.display_name` (gdy nie null).
- Gdy lista pusta: komunikat „Nie masz jeszcze żadnych wydarzeń. Dodaj pierwsze!".
- Gdy `successMsg`: komunikat „Wydarzenie zostało dodane!" (prosty div, nie toast — MVP).
- Przycisk/link „Dodaj wydarzenie" → `/events/new`.
- Layout: `<Layout title="Moje wydarzenia">`, responsywny — na 360px lista układa się pionowo (każdy event to pełna szerokość karty).

### Success Criteria

#### Automated Verification

- `src/pages/events/index.astro` istnieje
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification

- Wejście na `/events` jako zalogowany użytkownik → strona ładuje się, widać listę lub komunikat „brak wydarzeń"
- Wejście na `/events` jako wylogowany → redirect na `/auth/signin`
- Po wstawieniu eventu przez Supabase Studio → event widoczny na liście z imieniem osoby (nie UUID)
- Layout nie jest złamany przy szerokości 360px (DevTools mobile view)

**Implementation Note:** Po ukończeniu Phase 2, pauza przed Phase 3.

---

## Phase 3: Formularz /events/new + integracja dashboard

### Overview

Tworzy React Island `EventForm.tsx`, stronę `/events/new` i aktualizuje dashboard o link nawigacyjny. Zamyka pełny flow end-to-end.

### Changes Required

#### 1. React Island — formularz dodawania eventu

**File:** `src/components/events/EventForm.tsx`

**Intent:** Controlled form submittujący do POST `/api/events`; wyświetla błąd z `?error=`, HTML5 validation attributes na polach; pokazuje dropdown „Kto jedzie" tylko gdy zaznaczono checkbox „auto potrzebne".

**Contract:**

Props:
```ts
interface Props {
  profiles: Pick<HouseholdMemberProfile, "id" | "display_name" | "kind">[];
  error?: string | null;
}
```

Pola formularza (wszystkie jako `name=` per `newEventSchema`):
- `title` — `<input type="text" required maxLength={200}>`
- `subject_id` — `<select required>` z opcjami z `profiles`; pierwsza opcja: `<option value="">-- wybierz osobę --</option>`
- `date` — `<input type="date" required>` (domyślnie dzisiejsza data)
- `time` — `<input type="time" required>`
- `duration_minutes` — `<input type="number" required min={1} max={1440}>`
- `location` — `<input type="text" maxLength={300}>`
- `notes` — `<textarea maxLength={2000}>`
- `car_needed` — `<input type="checkbox" name="car_needed" value="on">` + stan `useState<boolean>`
- `driver_id` — `<select>` z opcjami z `profiles` + pustą opcją (NULL); widoczny tylko gdy `car_needed === true` (conditional render, nie `display:none` — pole nie istnieje w DOM gdy ukryte, więc nie trafia do formData)

Obsługa błędu: gdy `error` prop nie null → wyświetla `<ServerError>` (import z `@/components/auth/ServerError`).

Formularz: `<form method="POST" action="/api/events">`.

#### 2. Strona formularza /events/new

**File:** `src/pages/events/new.astro`

**Intent:** SSR strona pobierająca profile household i przekazująca je do `EventForm` jako props; odczytuje `?error=` z URL.

**Contract:** Astro frontmatter:
- `createClient` → `supabase.from("household_members_profiles").select("id, display_name, kind").order("display_name")` → `profiles`.
- `const error = Astro.url.searchParams.get("error")`.
- Renderuje `<EventForm {profiles} {error} client:load />`.
- Layout: `<Layout title="Dodaj wydarzenie">`.

#### 3. Link z dashboardu

**File:** `src/pages/dashboard.astro`

**Intent:** Dać zalogowanemu użytkownikowi nawigację do listy eventów — bez tego `/events` jest niedostępne z UI.

**Contract:** Dodać link/przycisk „Moje wydarzenia" prowadzący do `/events` i link „Dodaj wydarzenie" prowadzący do `/events/new` — w istniejącej sekcji dashboardu, przed formularzem sign-out.

### Success Criteria

#### Automated Verification

- `src/components/events/EventForm.tsx` istnieje
- `src/pages/events/new.astro` istnieje
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification

- Pełny flow: `/dashboard` → klik „Moje wydarzenia" → `/events` → klik „Dodaj wydarzenie" → `/events/new` → formularz wypełniony → submit → `/events?success=1` z nowym eventem na liście
- Dropdown „Osoba" zawiera profile z DB (imiona, nie UUID-y)
- Checkbox „auto potrzebne" odznaczony → dropdown „Kto jedzie" niewidoczny w DOM
- Checkbox „auto potrzebne" zaznaczony → dropdown „Kto jedzie" widoczny i ma opcje z profili
- HTML5 `required` blokuje submit przy pustym tytule lub niwybranej osobie (bez JS)
- Błąd walidacji server-side (np. `duration_minutes=0`) → redirect z `?error=...` i komunikat widoczny na formularzu
- Layout formularza czytelny na 360px (telefon)

**Implementation Note:** Po ukończeniu Phase 3 i przejściu wszystkich testów, pauza na końcowe potwierdzenie przed zamknięciem change.

---

## Testing Strategy

### Unit Tests

F-01 ustanowił zasadę: unit testy wchodzą przy pierwszej realnej potrzebie algorytmicznej (S-02: detekcja konfliktu). S-01 nie wprowadza logiki algorytmicznej poza walidacją Zod, którą sprawdza lint + build. Brak unit testów w tej fazie — świadoma decyzja per roadmap (`main_goal: learn`, `top_blocker: time`).

### Integration Tests

Smoke test RLS z F-01 pokrywa izolację danych. Realny INSERT przez `/api/events` + weryfikacja w Studio to odpowiednik integration testu dla S-01 (krok 1.5 w Manual Verification).

### Manual Testing Steps

1. Dodaj event przez Supabase Studio (tabela `events`, INSERT z poprawnym `household_id`).
2. Wejdź na `/events` — event widoczny z imieniem osoby.
3. Wypełnij formularz `/events/new` — sprawdź dropdown z profilami.
4. Zaznacz „auto potrzebne" — sprawdź pojawienie się dropdownu kierowcy.
5. Wyślij formularz — sprawdź redirect i komunikat sukcesu.
6. Wyślij formularz bez tytułu — sprawdź blokadę HTML5.
7. Wyślij formularz z `duration_minutes=0` — sprawdź błąd server-side.
8. Sprawdź mobilny layout (360px DevTools).

## Performance Considerations

Mała skala (`target_scale: small`). Supabase query `listEvents` pobiera wszystkie eventy household bez paginacji — akceptowalne dla rodziny z kilkudziesięcioma eventami. Indeks `(household_id, starts_at)` z F-01 pokrywa ORDER BY. JOIN z profilami to single query, nie N+1.

## Migration Notes

Brak migracji w S-01 — schemat z F-01 jest kompletny dla tego slice'a.

## References

- Roadmap S-01: `context/foundation/roadmap.md` (sekcja `## Slices` → `### S-01`)
- PRD: `context/foundation/prd.md` (FR-001, FR-002, FR-003, US-01 partial, NFR responsywność 360px)
- F-01 migracja: `supabase/migrations/20260610112151_household_events_foundation.sql`
- Typy: `src/types.ts`
- Wzorzec API route: `src/pages/api/auth/signup.ts`
- Wzorzec React form: `src/components/auth/SignUpForm.tsx`
- Wzorzec SSR strony: `src/pages/dashboard.astro`
- Change identity: `context/changes/s01-first-event-in-schedule/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Serwis events + endpoint POST

#### Automated

- [x] 1.1 `src/lib/services/events.ts` istnieje i eksportuje `getHouseholdId`, `createEvent`, `listEvents`, `EventWithProfiles` — 5d91255
- [x] 1.2 `src/pages/api/events/index.ts` istnieje i eksportuje `POST` — 5d91255
- [x] 1.3 Lint przechodzi: `npm run lint` — 5d91255
- [x] 1.4 Build przechodzi: `npm run build` — 5d91255

#### Manual

- [x] 1.5 POST na `/api/events` z poprawnym formData → event zapisany w Supabase Studio — 5d91255
- [x] 1.6 POST z brakującym `title` → redirect na `/events/new?error=...` — 5d91255

### Phase 2: Strona listy /events

#### Automated

- [x] 2.1 `src/pages/events/index.astro` istnieje — 390bd93
- [x] 2.2 Lint przechodzi: `npm run lint` — 390bd93
- [x] 2.3 Build przechodzi: `npm run build` — 390bd93

#### Manual

- [x] 2.4 `/events` jako zalogowany → strona ładuje się z listą lub komunikatem pustym — 390bd93
- [x] 2.5 `/events` jako wylogowany → redirect na `/auth/signin` — 390bd93
- [x] 2.6 Event wstawiony przez Studio → widoczny na liście z `display_name` osoby — 390bd93
- [x] 2.7 Layout nie złamany przy 360px — 390bd93

### Phase 3: Formularz /events/new + integracja dashboard

#### Automated

- [x] 3.1 `src/components/events/EventForm.tsx` istnieje — 2b63bdf
- [x] 3.2 `src/pages/events/new.astro` istnieje — 2b63bdf
- [x] 3.3 Lint przechodzi: `npm run lint` — 2b63bdf
- [x] 3.4 Build przechodzi: `npm run build` — 2b63bdf

#### Manual

- [x] 3.5 Pełny flow: dashboard → lista → formularz → submit → lista z nowym eventem — 2b63bdf
- [x] 3.6 Dropdown „Osoba” zawiera profile z DB — 2b63bdf
- [x] 3.7 Checkbox „auto potrzebne” toggle — dropdown „Kto jedzie” pokazuje/ukrywa się — 2b63bdf
- [x] 3.8 HTML5 `required` blokuje submit przy pustym tytule — 2b63bdf
- [x] 3.9 Błąd server-side widoczny na formularzu przez `?error=` — 2b63bdf
- [x] 3.10 Layout formularza czytelny na 360px — 2b63bdf
