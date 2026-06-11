# S-01: Pierwsze wydarzenie w harmonogramie — Plan Brief

> Full plan: `context/changes/s01-first-event-in-schedule/plan.md`

## What & Why

Użytkownik po zalogowaniu nie ma żadnego UI do dodawania ani przeglądania wydarzeń — baza jest gotowa (F-01), ale brakuje całej warstwy aplikacji. S-01 dostarcza minimalny formularz + listę, które odblokowują resztę roadmapy: S-02 (detekcja konfliktu) nie ma sensu bez możliwości dodania choćby jednego eventu.

## Starting Point

F-01 dostarczył tabele `events`, `household_members_profiles` z RLS, typy TS (`Event`, `NewEvent`) i wzorce: API route z `formData()` (signup.ts), React controlled form (SignUpForm.tsx), SSR Astro z middleware auth (dashboard.astro). Nie istnieje żaden endpoint ani UI dla eventów.

## Desired End State

Zalogowany rodzic wchodzi na dashboard, klika „Moje wydarzenia", trafia na `/events` (lista chronologiczna), klika „Dodaj wydarzenie", wypełnia formularz na `/events/new` (tytuł, osoba, data/godzina, czas trwania, lokalizacja, notatki, flaga auta + kto jedzie), zapisuje i wraca na listę z nowym eventem widocznym z imieniem osoby.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Umiejscowienie listy | `/events` — osobna strona | Dashboard ma być „Dziś" (S-04); oddzielenie zapobiega długowi technicznemu | Plan |
| Umiejscowienie formularza | `/events/new` — osobna strona Astro | Spójne z wzorcem auth (signup/signin = osobne strony); brak JS overlay | Plan |
| Pobieranie profili | Server-side w Astro frontmatter | Zero client-side fetch, spójne z wzorcem dashboard.astro | Plan |
| Walidacja | Zod server-side + HTML5 required/min/max client-side | Server: jedyne źródło prawdy; HTML5: szybki feedback bez JS biblioteki | Plan |
| driver_id widoczność | Conditional render — tylko gdy car_needed = true | Logiczne UX; pole nieobecne w DOM → nie trafia do formData przy car_needed=false | Plan |
| Po sukcesie | Redirect na `/events?success=1` | Użytkownik od razu widzi nowy event na liście | Plan |
| Zakres listy | Wszystkie eventy DESC | MVP, mała skala; S-03 (edit/delete) potrzebuje dostępu do przeszłych eventów | Plan |
| Nawigacja z dashboard | Link „Moje wydarzenia" + „Dodaj wydarzenie" | Nie zmienia struktury dashboard (S-04 go przeprojektuje) | Plan |

## Scope

**In scope:**
- `src/lib/services/events.ts` — `getHouseholdId`, `createEvent`, `listEvents` + typ `EventWithProfiles`
- `src/pages/api/events/index.ts` — POST endpoint z Zod validation
- `src/pages/events/index.astro` — lista eventów household
- `src/pages/events/new.astro` — strona formularza (SSR + React Island)
- `src/components/events/EventForm.tsx` — React Island z togglem car_needed
- `src/middleware.ts` — dodanie `/events` do PROTECTED_ROUTES
- `src/pages/dashboard.astro` — link nawigacyjny do `/events`

**Out of scope:**
- Edycja i usuwanie (S-03)
- Detekcja konfliktu (S-02)
- Dashboard „Dziś" (S-04)
- Paginacja listy
- Timezone conversion

## Architecture / Approach

Klasyczna Astro SSR + React Island. Astro frontmatter robi server-side data fetching (profile dla dropdownu, lista eventów) i przekazuje dane jako props. React Island (`EventForm`) obsługuje tylko lokalny stan UI (toggle car_needed). Endpoint `/api/events` jest stateless — przyjmuje formData, waliduje Zod, wywołuje serwis, redirect. Cały dostęp do DB przez `src/lib/services/events.ts` — API routes i strony Astro nie wywołują Supabase bezpośrednio.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
|---|---|---|
| 1. Serwis + endpoint POST | Backend testowany niezależnie od UI | Zod coercions (checkbox, date+time split, FK UUID) |
| 2. Strona listy `/events` | Widok listy z JOIN po profilach | Nieoczywisty JOIN z dwoma FK do tej samej tabeli |
| 3. Formularz + dashboard | Pełny flow end-to-end; React Island | car_needed toggle + conditional DOM + 360px layout |

**Prerequisites:** F-01 done (✓), Stack działający lokalnie (✓), `.dev.vars` skonfigurowany (✓)  
**Estimated effort:** ~2-3 sesje, 3 fazy

## Open Risks & Assumptions

- Supabase nested select `!subject_id` / `!driver_id` wymaga jawnych FK hintsów gdy tabela ma dwa FK do tej samej tabeli nadrzędnej — sprawdzić że migration definiuje oba FK (F-01 ✓, patrz SQL).
- HTML5 `required` nie działa gdy JavaScript wyłączony (edge case MVP-acceptable); Zod server-side jest ostatnią linią obrony.
- `starts_at` jako lokalny datetime bez timezone — akceptowalne dla single-household MVP; problem gdy rodzina w różnych strefach (Parked).

## Success Criteria (Summary)

- Zalogowany rodzic dodaje wydarzenie przez formularz i widzi je na liście z imieniem osoby (nie UUID)
- Błędne dane formularza zwracają czytelny komunikat błędu (nie 500)
- Layout działa na ekranie 360px
