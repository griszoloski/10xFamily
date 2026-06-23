# Today Dashboard Implementation Plan

## Overview

Zastąpienie placeholdera `/dashboard` produkcyjnym widokiem "Dashboard Dziś". Strona pokazuje: dzisiejsze wydarzenia chronologicznie z informacją o aucie, alerty konfliktów auta dla okna 7 dni, listę najbliższych 7 dni pogrupowaną po dniach oraz nawigację. Jest to S-04 — ostatni MVP slice, realizujący PRD FR-008 i Secondary Success Criterion.

## Current State Analysis

`/dashboard` to chroniony auth route z minimalnym placeholderem: wyświetla email użytkownika i linki do `/events` i `/events/new`. `listEvents` i `detectCarConflicts` są gotowe w service layer, ale oba są niesfiltrowane datowo — pobierają całą historię household. Brakuje date-filtered query helper i produkcyjnego UI dashboardu.

## Desired End State

Po zalogowaniu użytkownik ląduje na `/dashboard` i widzi:
1. Nagłówek z dzisiejszą datą i przyciskiem "Dodaj wydarzenie"
2. Banery konfliktów auta (per para) dla wszystkich wydarzeń w oknie dziś+7 dni — lub brak banerów gdy nie ma konfliktów
3. Sekcja **Dziś** — lista dzisiejszych wydarzeń posortowana rosnąco po `starts_at`, każda karta z: tytułem, godziną, osobą, czasem trwania, informacją o aucie/kierowcy; komunikat "Brak wydarzeń na dziś." gdy pusta
4. Sekcja **Najbliższe 7 dni** — wydarzenia od jutra do dziś+7 pogrupowane po dniach (nagłówek daty + karty), lub komunikat gdy pusto
5. Nawigacja: "Wszystkie wydarzenia" + Sign out

### Key Discoveries:

- `listEvents` używa joinu `household_members_profiles!subject_id` i `!driver_id` — nowy helper musi zachować ten sam pattern (`src/lib/services/events.ts:68–84`)
- `starts_at` przechowywane jako naiwny local ISO string bez timezone — filtrowanie `gte/lte` w Supabase porównuje stringowo, co jest spójne z pozostałym kodem (`src/types.ts:31`)
- `detectCarConflicts` przyjmuje `EventWithProfiles[]` i grupuje per dzień przez `.slice(0,10)` — zasilamy ją połączonym zbiorem today+upcoming (`src/lib/services/events.ts:14`)
- Dashboard layout: brak Topbar w `Layout.astro` — nawigacja inline jak w placeholder
- `new Date().toISOString().slice(0,10)` daje datę UTC — akceptowalne dla MVP single-household (znane ograniczenie przy UTC+N po północy, tożsame z S-02)

## What We're NOT Doing

- Nie dodajemy migracji SQL — schema gotowa
- Nie dodajemy Topbar do dashboardu — nawigacja inline
- Nie paginujemy wyników (small-scale household)
- Nie dodajemy widoku tygodniowego/miesięcznego (Parked w roadmapie)
- Nie obsługujemy multi-resource konfliktów
- Nie dodajemy "live refresh" — strona renderuje SSR przy każdym żądaniu

## Implementation Approach

Dwie fazy w kolejności zależności: najpierw service helper, potem UI. Jeden DB request per load dashboardu — `listEventsByDateRange` pobiera cały horyzont 7+1 dni, frontmatter dzieli na sekcje w pamięci. `detectCarConflicts` reużyta bez zmian na pełnym zbiorze okna.

## Phase 1: Service Layer — Date-Filtered Event Query

### Overview

Dodanie `listEventsByDateRange` do `src/lib/services/events.ts` — parametryzowany helper z filtrem daty, reużywający joiny z `listEvents`.

### Changes Required:

#### 1. `listEventsByDateRange` function

**File**: `src/lib/services/events.ts`

**Intent**: Wyeksportuj `listEventsByDateRange(supabase: SupabaseClient, from: string, to: string): Promise<EventWithProfiles[]>`. Funkcja odpytuje tabelę `events` z `.gte("starts_at", from).lte("starts_at", to)`, z identycznym selectem jak `listEvents` (join `subject` + `driver`), sortowaniem `.order("starts_at", { ascending: true })`.

**Contract**: Sygnatura identyczna typowo z `listEvents` — zwraca `EventWithProfiles[]` posortowane ASC. Parametry `from` i `to` to ISO strings bez timezone, np. `"2026-06-23T00:00:00"` i `"2026-06-30T23:59:59"`. Rzuca `Error` gdy Supabase zwróci błąd (analogicznie do `listEvents`).

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi bez błędów
- `npm run build` przechodzi bez błędów

#### Manual Verification:

- Funkcja dostępna do importu (weryfikacja przez Phase 2)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Dashboard Page Rebuild

### Overview

Pełne przepisanie `src/pages/dashboard.astro` — produkcyjny widok z trzema sekcjami, conflict banners i nawigacją.

### Changes Required:

#### 1. Frontmatter — dane i logika widoku

**File**: `src/pages/dashboard.astro`

**Intent**: Zastąp cały frontmatter. Oblicz `todayStr` i `windowEndStr` (dziś + 7 dni) przez `new Date().toISOString().slice(0,10)`. Wywołaj `listEventsByDateRange(supabase, todayStart, windowEnd)` i podziel wynik: `todayEvents` (starts_at zaczyna się od `todayStr`) i `upcomingEvents` (pozostałe). Uruchom `detectCarConflicts` na pełnym zbiorze okna. Zbuduj strukturę upcomingEvents pogrupowaną po dniach (`Map<string, EventWithProfiles[]>`). Zaimportuj `listEventsByDateRange`, `detectCarConflicts`, `cn`.

**Contract**: Zmienne dostępne w template: `todayEvents: EventWithProfiles[]`, `upcomingByDay: Map<string, EventWithProfiles[]>`, `conflictPairs: ConflictPair[]`, `todayStr: string`, `user` (z `Astro.locals`). Obsługa braku Supabase klienta → puste tablice (analogicznie do `/events`).

#### 2. Nagłówek dashboardu

**File**: `src/pages/dashboard.astro`

**Intent**: Renderuj nagłówek z tytułem "Dashboard Dziś", dzisiejszą datą sformatowaną po polsku (dzień tygodnia + data), oraz przyciskiem "Dodaj wydarzenie" linkującym do `/events/new`. Styl spójny z `/events` (gradient text, dark glass).

**Contract**: Data z `new Date()` formatowana przez `toLocaleDateString("pl-PL", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })`.

#### 3. Banery konfliktów auta

**File**: `src/pages/dashboard.astro`

**Intent**: Renderuj per-para conflict banery identycznie jak w `/events/index.astro` — czerwone banery z `⚠ Konflikt auta:` tytułami, godziną HH:MM, czasem trwania i osobami. Banery widoczne przed sekcją "Dziś". Gdy brak konfliktów — sekcja nie renderuje się.

**Contract**: Reużyj identyczny markup co `/events/index.astro:62–75`.

#### 4. Sekcja "Dziś"

**File**: `src/pages/dashboard.astro`

**Intent**: Sekcja z nagłówkiem "Dziś". Gdy `todayEvents.length === 0` — pokaż komunikat "Brak wydarzeń na dziś.". Gdy niepusta — lista kart w kolejności chronologicznej ASC: tytuł, godzina HH:MM, osoba (`subject.display_name`), czas trwania, informacja o aucie (gdy `car_needed`: "Auto: [driver.display_name]" lub "Auto: potrzebne"). Dodaj "Edytuj" link na każdej karcie.

**Contract**: Każda karta zawiera conajmniej: godzinę, tytuł, osobę, czas trwania, auto/kierowcę (gdy dotyczy). Brak DeleteEventButton — dashboard to widok tylko do odczytu.

#### 5. Sekcja "Najbliższe 7 dni"

**File**: `src/pages/dashboard.astro`

**Intent**: Sekcja z nagłówkiem "Najbliższe 7 dni". Iteruj po `upcomingByDay` (Map, klucze to ISO daty YYYY-MM-DD posortowane ASC). Dla każdego dnia: nagłówek daty (dzień tygodnia + data, po polsku) + karty wydarzeń z tym samym układem co sekcja "Dziś". Gdy `upcomingByDay.size === 0` — pokaż "Brak nadchodzących wydarzeń.".

**Contract**: Daty kluczowe w `upcomingByDay` posortowane string-ASC (ISO dates sortują się poprawnie leksykograficznie). Karta identyczna jak w sekcji "Dziś".

#### 6. Nawigacja na dole

**File**: `src/pages/dashboard.astro`

**Intent**: Na dole strony: link "Wszystkie wydarzenia" do `/events` i formularz POST Sign out do `/api/auth/signout`. Styl identyczny z placeholderem.

**Contract**: Zachowany z placeholdera — `<a href="/events">` i `<form method="POST" action="/api/auth/signout">`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi bez błędów
- `npm run build` przechodzi bez błędów

#### Manual Verification:

- Strona `/dashboard` ładuje się po zalogowaniu bez błędu
- Sekcja "Dziś" pokazuje dzisiejsze wydarzenia w kolejności chronologicznej
- Brak dzisiejszych wydarzeń → komunikat "Brak wydarzeń na dziś."
- Informacja o aucie i kierowcy widoczna na kartach gdy `car_needed=true`
- Sekcja "Najbliższe 7 dni" grupuje wydarzenia po dniach
- Conflict banery pojawiają się dla par z `car_needed` + overlap (dziś lub w ciągu 7 dni)
- Brak banerów gdy brak konfliktów w oknie 7 dni
- Layout nie przepełnia się na 360 px
- Przycisk Sign out i link "Wszystkie wydarzenia" działają

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `listEventsByDateRange` z zakresem wykluczającym wszystkie eventy → `[]`
- `listEventsByDateRange` z zakresem obejmującym jeden event → `[event]`

### Integration Tests:

- Dashboard z pustą DB → "Brak wydarzeń na dziś." + "Brak nadchodzących wydarzeń."
- Dashboard z dzisiejszym eventem z `car_needed` i nakładającym się innym → baner konfliktu

### Manual Testing Steps:

1. Zaloguj się → redirected na `/dashboard` → strona renderuje się
2. Dodaj 2 wydarzenia na dziś z `car_needed=true` nakładające się → wróć na dashboard → baner konfliktu widoczny
3. Dodaj wydarzenie na jutro → pojawia się w "Najbliższe 7 dni" pod właściwą datą
4. Dodaj wydarzenie za 8 dni → NIE pojawia się na dashboardzie
5. Sprawdź layout na 360 px — karty, banery, nagłówki nie przepełniają

## Performance Considerations

`listEventsByDateRange` pobiera max ~8 dni x ~10 wydarzeń/dzień = ~80 rekordów — pomijalny narzut. Supabase filtruje po indeksowanym `starts_at` (`events_household_starts_at_idx`). Jeden DB round-trip per load.

## Migration Notes

Brak nowej migracji SQL — schema z `events_household_starts_at_idx` obsługuje filtrowanie po dacie.

## References

- PRD FR-008: `context/foundation/prd.md`
- Roadmap S-04: `context/foundation/roadmap.md`
- Events service: `src/lib/services/events.ts`
- Conflict banners pattern: `src/pages/events/index.astro:62–75`
- Placeholder dashboard: `src/pages/dashboard.astro`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Service Layer — Date-Filtered Event Query

#### Automated

- [x] 1.1 `npm run lint` przechodzi bez błędów — 3fa7eac
- [x] 1.2 `npm run build` przechodzi bez błędów — 3fa7eac

#### Manual

- [x] 1.3 Funkcja dostępna do importu (weryfikacja przez Phase 2)

### Phase 2: Dashboard Page Rebuild

#### Automated

- [x] 2.1 `npm run lint` przechodzi bez błędów
- [x] 2.2 `npm run build` przechodzi bez błędów

#### Manual

- [x] 2.3 Strona `/dashboard` ładuje się po zalogowaniu bez błędu
- [x] 2.4 Sekcja "Dziś" pokazuje dzisiejsze wydarzenia w kolejności chronologicznej
- [x] 2.5 Brak dzisiejszych wydarzeń → komunikat "Brak wydarzeń na dziś."
- [x] 2.6 Informacja o aucie i kierowcy widoczna na kartach gdy car_needed=true
- [x] 2.7 Sekcja "Najbliższe 7 dni" grupuje wydarzenia po dniach
- [x] 2.8 Conflict banery pojawiają się dla par z car_needed + overlap w oknie 7 dni
- [x] 2.9 Brak banerów gdy brak konfliktów w oknie
- [x] 2.10 Layout nie przepełnia się na 360 px
- [x] 2.11 Przycisk Sign out i link "Wszystkie wydarzenia" działają
