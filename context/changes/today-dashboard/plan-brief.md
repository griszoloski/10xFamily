# Today Dashboard — Plan Brief

> Full plan: `context/changes/today-dashboard/plan.md`

## What & Why

Zastąpienie placeholdera `/dashboard` produkcyjnym widokiem "Dziś", który odpowiada na pytanie "czy ogarniemy ten dzień jednym samochodem?". Dashboard agreguje dzisiejsze wydarzenia, konflikty auta na 7-dniowym horyzoncie i najbliższe wydarzenia pogrupowane po dniach — realizując PRD FR-008 i Secondary Success Criterion.

## Starting Point

`/dashboard` to auth-protected placeholder pokazujący email użytkownika i dwa linki. `listEvents` i `detectCarConflicts` istnieją już w service layer, ale brakuje date-filtered query helper (pobierają całą historię). Nie ma komponentów dashboardowych.

## Desired End State

Zalogowany rodzic widzi na `/dashboard`: banery konfliktów auta dla całego tygodnia (jeśli są), sekcję "Dziś" z chronologiczną listą wydarzeń i info o kierowcy, sekcję "Najbliższe 7 dni" pogrupowaną po dniach, oraz nawigację (dodaj wydarzenie, wszystkie wydarzenia, sign out).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Okno "najbliższe" | 7 dni | Naturalny horyzont planowania tygodniowego; zgodnie z roadmap default |
| Zakres alertów konfliktu | Wszystkie dni w oknie (7 dni) | Kompletny obraz logistyczny — konflikt jutro jest równie ważny |
| Pobieranie danych | Nowy `listEventsByDateRange(from, to)` | Wydajne, date-filtered; adresuje O4 z S-02 review; jeden DB round-trip |
| Pusta sekcja "Dziś" | Pokaż komunikat | Unika dezorientacji "czy strona się załadowała?" |
| Układ "Najbliższe" | Pogrupowane po dniach | Łatwy skan "co w piątek" |
| Placeholder | Zastąp całkowicie | Placeholder nie miał wartości produkcyjnej |
| Nawigacja | Inline (bez Topbar) | Topbar nie jest w Layout.astro dla tej strony |

## Scope

**In scope:**
- `listEventsByDateRange(supabase, from, to)` w `src/lib/services/events.ts`
- Pełne przepisanie `src/pages/dashboard.astro`
- Trzy sekcje: conflict banners + Dziś + Najbliższe 7 dni
- Nawigacja inline: Dodaj wydarzenie, Wszystkie wydarzenia, Sign out

**Out of scope:**
- Nowe migracje SQL
- Topbar w layout
- Paginacja (small-scale household)
- Widok tygodniowy/miesięczny (Parked)
- Live refresh / WebSocket

## Architecture / Approach

Jeden DB request per dashboard load: `listEventsByDateRange` pobiera okno [dziś, +7 dni]. Frontmatter w Astro SSR: dzieli wynik in-memory na todayEvents / upcomingEvents, buduje `Map<string, EventWithProfiles[]>` dla grupowania po dniach, uruchamia `detectCarConflicts` na pełnym zbiorze. Czyste SSR — brak React islands.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Service Layer | `listEventsByDateRange` — date-filtered query z joinami | UTC date comparison przy UTC+N po północy — akceptowalne dla MVP |
| 2. Dashboard Page Rebuild | Pełny widok produkcyjny z 3 sekcjami | Układ na 360 px — wymaga weryfikacji mobilnej |

**Prerequisites:** S-02 (car-conflict-alert) ukończony ✓  
**Estimated effort:** ~1 sesja, 2 fazy sekwencyjne.

## Open Risks & Assumptions

- `todayStr` obliczany przez UTC `Date.toISOString()` — przy UTC+N po północy strona może pokazywać "jutrzejszy" dzień jako "dziś"; znane ograniczenie MVP, tożsame z S-02
- `upcomingByDay` Map posortowana przez string-ASC kluczy ISO — poprawne leksykograficznie dla dat YYYY-MM-DD

## Success Criteria (Summary)

- Strona `/dashboard` pokazuje dzisiejsze wydarzenia z informacją o aucie po zalogowaniu
- Alerty konfliktów auta widoczne dla nakładających się car-needed wydarzeń w oknie 7 dni
- Sekcja "Najbliższe 7 dni" grupuje wydarzenia per dzień
