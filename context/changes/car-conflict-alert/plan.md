# Car Conflict Alert Implementation Plan

## Overview

Implementacja detekcji konfliktów zasobów — gdy dwa lub więcej wydarzeń w nakładającym się oknie czasowym tego samego dnia mają flagę `car_needed = true`, użytkownik widzi wyraźny alert z tytułami, godzinami i osobami. Jest to North Star Slice (S-02), będący rdzeniem wartości produktu według PRD FR-007 i US-01.

## Current State Analysis

Aplikacja posiada:
- Pełny CRUD wydarzeń (S-01, S-03) — events są już w DB z polem `starts_at` (`timestamptz`) i `duration_minutes`
- `listEvents` w `src/lib/services/events.ts` zwraca `EventWithProfiles[]` z pełnymi danymi profili
- Strona `/events` renderuje listę i przyjmuje flagę `?success=1`, `?updated=1`, `?deleted=1`
- Schema `events` posiada już `events_car_needed_partial_idx` (indeks częściowy dla `car_needed`) i komentarz dokumentujący planowane użycie `tstzrange &&` — infrastruktura jest gotowa

Brakuje:
- Funkcji `detectCarConflicts` — brak jakiejkolwiek logiki detekcji kolizji
- Wizualnych alertów na `/events` — lista nie sygnalizuje konfliktów
- Oznaczenia kolidujących kart wydarzeń

## Desired End State

Po wdrożeniu:
- Zalogowany rodzic widzi na `/events` per-para czerwone banery dla każdej kolizji: "⚠ Konflikt auta: [tytuł A] (HH:MM, X min, osoba: A) pokrywa się z [tytuł B] (HH:MM, X min, osoba: B)"
- Karty wydarzeń będących w konflikcie mają widoczne wizualne oznaczenie (np. czerwona ramka/badge)
- Po dodaniu lub edycji wydarzenia z `car_needed=true` — redirect zawiera parametr `?car_conflict=1`, co wyświetla dodatkowy komunikat nawigacyjny: "Zapisano. Sprawdź alerty konfliktu auta poniżej."
- Brak false positive: dwa wydarzenia bez flagi auta, lub dwa z flagą auta na różne dni, lub dwa z flagą auta tego samego dnia ale nie nakładające się (lub tylko stykające się) — żadnego alertu

### Key Discoveries:

- `starts_at` przechowywane jako naiwny lokalny ISO string (np. `2026-06-20T09:00:00`) — bezpieczne porównywanie przez `.slice(0, 10)` dla "tego samego dnia" (`src/types.ts:31`)
- Istniejące API routes redirectują na `/events?success=1` / `?updated=1` — wystarczy dołączyć `&car_conflict=1` (`src/pages/api/events/index.ts`, `src/pages/api/events/[id].ts`)
- Roadmap precyzuje: punkt styku (A kończy dokładnie kiedy B zaczyna) **nie jest konfliktem** — wymagany strict overlap: `aStart < bEnd && bStart < aEnd`
- `EventWithProfiles` jest zdefiniowane w `src/lib/services/events.ts:6`, nie w `src/types.ts` — `ConflictPair` powinien żyć w tym samym pliku
- Strona `/events` jest Astro SSR — `detectCarConflicts` można wywołać w frontmatter, bez React island dla logiki detekcji

## What We're NOT Doing

- Nie używamy Postgres `tstzrange &&` — TS w memory jest wystarczający przy small-scale household (n < 200 wydarzeń)
- Nie pokazujemy alertów konfliktu na stronach `/events/new` i `/events/[id]/edit` (live preview podczas wypełniania formularza)
- Nie dodajemy nowej migracji SQL — schema jest gotowa
- Nie obsługujemy multi-resource konfliktów (wiele aut, rowerów itp.) — MVP: tylko flaga `car_needed`
- Nie wysyłamy powiadomień ani emaili o konfliktach
- Nie implementujemy dashboardu Dziś (S-04) — alerty na `/events` to tymczasowy punkt kontaktu

## Implementation Approach

Trzy fazy w kolejności zależności:

1. **Logika detekcji (service layer)** — czysta funkcja `detectCarConflicts`, niezależna od UI, łatwo testowalna
2. **UI na liście wydarzeń** — Astro SSR, bez nowych React islands; `detectCarConflicts` wywoływana w frontmatter; banery per-para + oznaczenia kart + obsługa `?car_conflict=1`
3. **API signal** — minimalna zmiana w dwóch endpointach: sprawdź `car_needed` w form data i dołącz `car_conflict=1` do redirect URL

## Critical Implementation Details

**Strict overlap, nie touch:** Warunek to `aStart < bEnd && bStart < aEnd` (strict less-than). Oba operatory muszą być `<`, nie `<=`. Punkt styku (A.end === B.start) NIE jest konfliktem — wymóg z roadmap.

**Konwersja czasu:** `new Date(starts_at).getTime()` działa poprawnie dla naiwnych ISO stringów w środowisku Node.js (interpretuje jako UTC). Ponieważ wszystkie events są zapisywane spójnie tym samym mechanizmem, porównania par są poprawne — nie ma ryzyka błędu timezone przy porównaniu par tej samej bazy.

---

## Phase 1: Conflict Detection Service

### Overview

Implementacja czystej funkcji `detectCarConflicts` i exportowanie interfejsu `ConflictPair` — fundament dla Phase 2 i 3.

### Changes Required:

#### 1. Dodaj `ConflictPair` interface i `detectCarConflicts` function

**File**: `src/lib/services/events.ts`

**Intent**: Wyeksportuj interface `ConflictPair` z polami `a` i `b` typu `EventWithProfiles` oraz funkcję `detectCarConflicts(events: EventWithProfiles[]): ConflictPair[]`. Funkcja filtruje do wydarzeń z `car_needed = true`, sprawdza wszystkie pary (i < j), dla każdej pary weryfikuje "ten sam dzień" przez `.slice(0, 10)` na `starts_at`, następnie oblicza strict overlap: `aStart < bEnd && bStart < aEnd` (czasy w milisekundach przez `Date.getTime()` + `duration_minutes * 60_000`).

**Contract**: Sygnatura: `detectCarConflicts(events: EventWithProfiles[]): ConflictPair[]`. Nie wywołuje Supabase, jest deterministyczna i nie mutuje wejścia. Zwraca tablicę — pusta tablica = brak konfliktów.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi bez błędów
- `npm run build` przechodzi bez błędów

#### Manual Verification:

- Funkcja dostępna w module (widoczna przez import na stronie w Phase 2)
- Wywołana na przykładowych danych testowych w devtools lub manualny smoke test przez Phase 2

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Events List — Conflict Banners and Card Indicators

### Overview

Integracja `detectCarConflicts` na stronie `/events`. Jeden baner per para kolidujących wydarzeń na górze listy, wizualne oznaczenie kart kolidujących wydarzeń, obsługa nowego parametru `?car_conflict=1`.

### Changes Required:

#### 1. Wywołaj detectCarConflicts w frontmatter

**File**: `src/pages/events/index.astro`

**Intent**: Zaimportuj `detectCarConflicts` i wywołaj ją na wynikach `listEvents`. Zbuduj `Set<string>` z ID wszystkich wydarzeń, które są w co najmniej jednej parze konfliktów (`conflictingIds`). Odczytaj `car_conflict` z URL params.

**Contract**: `conflictPairs: ConflictPair[]` i `conflictingIds: Set<string>` dostępne w template. Żadne dodatkowe zapytanie do DB — reużywa tablicy `events`.

#### 2. Banery per-para na górze listy

**File**: `src/pages/events/index.astro`

**Intent**: Przed listą wydarzeń, po istniejących banerach sukcesu/aktualizacji/usunięcia, wyrenderuj jeden baner per element `conflictPairs`. Każdy baner zawiera: tytuły obu wydarzeń (pogrubione), sformatowane godziny w formacie HH:MM, czas trwania w minutach, imiona osób (`subject.display_name`). Styl: ostrzegawczy czerwono-pomarańczowy spójny z projektem (klasy podobne do `border-red-400/30 bg-red-400/10 text-red-200`). Gdy brak konfliktów — sekcja nie jest renderowana.

**Contract**: Baner wyświetla dla pary: oba tytuły, oba `starts_at` sformatowane `HH:MM`, oba `duration_minutes`, oba `subject.display_name`.

#### 3. Baner nawigacyjny dla `?car_conflict=1`

**File**: `src/pages/events/index.astro`

**Intent**: Gdy `car_conflict=1` w URL params, wyświetl informacyjny baner "Zapisano. Sprawdź alerty konfliktu auta poniżej." w odcieniu niebieskawym lub amber — ZANIM banery konfliktów. Baner pojawia się niezależnie od tego czy są aktualnie konflikty (może już zostały naprawione).

**Contract**: Oddzielna zmienna `carConflictMsg = Astro.url.searchParams.get("car_conflict") === "1"`.

#### 4. Wizualne oznaczenie kart kolidujących wydarzeń

**File**: `src/pages/events/index.astro`

**Intent**: Na każdej karcie `<li>`, jeśli `conflictingIds.has(event.id)`, dodaj wizualne wyróżnienie — np. czerwona lewa krawędź (`border-l-4 border-red-400/60`) lub mały inline badge "⚠ Konflikt auta" przy tytule. Oznaczenie powinno być subtelne, nie zasłaniać treści karty.

**Contract**: Wyróżnienie realizowane przez warunkowe klasy CSS na elemencie `<li>` lub drobny badge inline — czyste Astro, bez React island.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi bez błędów
- `npm run build` przechodzi bez błędów

#### Manual Verification:

- Dodaj dwa wydarzenia z `car_needed=true`, tego samego dnia, nakładające się czasowo → widać baner konfliktu na liście z tytułami, godzinami i osobami
- Oba kolidujące karty mają wizualne oznaczenie
- Dodaj dwa wydarzenia z `car_needed=true`, tego samego dnia, ale NIE nakładające się → brak alertu
- Dodaj dwa wydarzenia z `car_needed=true`, tego samego dnia, z punktem styku (jedno kończy dokładnie o godzinie startu drugiego) → brak alertu
- Dodaj dwa wydarzenia BEZ `car_needed`, tego samego dnia, nakładające się → brak alertu
- Wiele par konfliktów → jeden baner per para
- Nawiguj na `/events?car_conflict=1` ręcznie → widoczny baner nawigacyjny

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: API Routes — Car Conflict Signal on Save

### Overview

Minimalna zmiana w dwóch endpointach: po udanym zapisie z `car_needed=true`, redirect dołącza `car_conflict=1` do URL, co wyzwala baner nawigacyjny z Phase 2.

### Changes Required:

#### 1. CREATE endpoint — dołącz `car_conflict=1`

**File**: `src/pages/api/events/index.ts`

**Intent**: Po udanym `createEvent`, sprawdź wartość pola `car_needed` z form data. Jeśli `car_needed = true`, redirect do `/events?success=1&car_conflict=1`. Jeśli false — bez zmian (`/events?success=1`).

**Contract**: `car_needed` jest już parsowane przez Zod schema w tym endpointcie — odczytaj wynik walidacji, nie form data ponownie.

#### 2. EDIT endpoint — dołącz `car_conflict=1`

**File**: `src/pages/api/events/[id].ts`

**Intent**: Po udanym `updateEvent`, sprawdź `car_needed` z zwalidowanych danych. Jeśli `car_needed = true`, redirect do `/events?updated=1&car_conflict=1`. Jeśli false — bez zmian (`/events?updated=1`).

**Contract**: Analogicznie do CREATE — reużyj już zwalidowanych danych Zod.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi bez błędów
- `npm run build` przechodzi bez błędów

#### Manual Verification:

- Utwórz wydarzenie z `car_needed=true` → po redirectcie widać baner "Sprawdź alerty konfliktu auta poniżej."
- Utwórz wydarzenie bez `car_needed` → brak bannera `car_conflict`, tylko `success`
- Edytuj wydarzenie i ustaw `car_needed=true` → baner po redirectcie
- Edytuj wydarzenie i odznacz `car_needed` → brak bannera
- Usuń wydarzenie → żaden nowy baner (DELETE nie zmieniony)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `detectCarConflicts([])` → `[]`
- Jedna para bez `car_needed` → `[]`
- Jedna para z `car_needed`, różne dni → `[]`
- Jedna para z `car_needed`, ten sam dzień, touch point (A kończy = B zaczyna) → `[]`
- Jedna para z `car_needed`, ten sam dzień, strict overlap → `[{a, b}]`
- Trzy events z `car_needed` w tym samym oknie → dwie lub trzy pary

### Integration Tests:

- Strona `/events` z events bez konfliktów → brak banerów
- Strona `/events` z conflicting events → baner per para

### Manual Testing Steps:

1. Dodaj dwa wydarzenia: tego samego dnia, `car_needed=true`, 09:00–10:00 i 09:30–10:30 → baner na liście, karty oznaczone
2. Sprawdź edge case: 09:00–10:00 i 10:00–11:00 (touch) → brak banera
3. Sprawdź edge case: 09:00–10:00 i 10:01–11:00 (1 min przerwy) → brak banera
4. Dodaj trzecie kolidujące wydarzenie 09:15–09:45 → widzę dwa banery (A+C, B+C lub więcej par)
5. Utwórz car_needed event przez formularz → po redirectcie widać baner nawigacyjny i banery konfliktów
6. Sprawdź na mobile 360px — banery i karty nie przepełniają layoutu

## Performance Considerations

`detectCarConflicts` ma złożoność O(n²) po odfiltrowanych wydarzeniach z `car_needed`. Przy small-scale household (< 200 wydarzeń miesięcznie, < 20 z `car_needed`) koszt jest pomijalny. Brak potrzeby memoizacji czy lazy evaluation.

## Migration Notes

Brak nowej migracji SQL — schema z `events_car_needed_partial_idx` i `events_household_starts_at_idx` jest gotowa. Istniejące dane nie wymagają przetworzenia.

## References

- PRD FR-007: `context/foundation/prd.md`
- US-01: `context/foundation/prd.md`
- Roadmap S-02: `context/foundation/roadmap.md`
- Events service: `src/lib/services/events.ts`
- Events list page: `src/pages/events/index.astro`
- Events schema: `supabase/migrations/20260610112151_household_events_foundation.sql`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Conflict Detection Service

#### Automated

- [x] 1.1 `npm run lint` przechodzi bez błędów — 62c804c
- [x] 1.2 `npm run build` przechodzi bez błędów — 62c804c

#### Manual

- [x] 1.3 Funkcja dostępna i poprawnie importowana (weryfikacja przez Phase 2)

### Phase 2: Events List — Conflict Banners and Card Indicators

#### Automated

- [x] 2.1 `npm run lint` przechodzi bez błędów
- [x] 2.2 `npm run build` przechodzi bez błędów

#### Manual

- [x] 2.3 Dwa car_needed events, ten sam dzień, overlap → baner konfliktu z tytułami, godzinami i osobami
- [x] 2.4 Kolidujące karty mają wizualne oznaczenie
- [x] 2.5 Dwa car_needed events, ten sam dzień, brak overlap → brak banera
- [x] 2.6 Touch point (A.end === B.start) → brak banera
- [x] 2.7 Dwa events bez car_needed, overlap → brak banera
- [x] 2.8 Wiele par → jeden baner per para
- [x] 2.9 `/events?car_conflict=1` ręcznie → widoczny baner nawigacyjny

### Phase 3: API Routes — Car Conflict Signal on Save

#### Automated

- [ ] 3.1 `npm run lint` przechodzi bez błędów
- [ ] 3.2 `npm run build` przechodzi bez błędów

#### Manual

- [ ] 3.3 CREATE car_needed=true → baner nawigacyjny po redirectcie
- [ ] 3.4 CREATE car_needed=false → brak bannera car_conflict
- [ ] 3.5 EDIT → car_needed=true → baner nawigacyjny po redirectcie
- [ ] 3.6 EDIT → car_needed=false → brak bannera car_conflict
- [ ] 3.7 DELETE → żaden nowy baner
