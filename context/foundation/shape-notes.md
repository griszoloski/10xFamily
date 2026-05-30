---
project: "10xFamily Schedule Hub"
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
created: 2026-05-20
updated: 2026-05-20
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "Coordination overhead — zbyt wiele rzeczy do skoordynowania (kto jedzie, kto zostaje, kto odbiera)"
    - topic: "core insight"
      decision: "Brak detekcji konfliktów zasobów (auto) + brak kontekstu rodzinnego + rozproszenie narzędzi (Calendar / czat / notes)"
    - topic: "primary persona scope"
      decision: "Konkretna rodzina (prywatny household) — nie multi-tenant SaaS"
    - topic: "auth model"
      decision: "Login per user — e-mail + hasło lub OAuth; płaski model ról dla MVP"
    - topic: "mvp flow"
      decision: "Kalendarz + detekcja konfliktu auta — login → dodaj event → dodaj drugi event → pokaż konflikt"
    - topic: "timeline"
      decision: "3 tygodnie after-hours, brak hard deadline"
  frs_drafted: 12
  quality_check_status: accepted
  open_questions:
    - "Role separation within household (admin vs member) — TBD; flat model assumed for MVP"
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Rodzice trójki dzieci utrzymują harmonogram rodziny w głowie i w rozproszonych narzędziach — kalendarzu, chacie, notatkach — które nie rozumieją fizycznych ograniczeń rodziny (jedno auto, kilkoro dzieci, kilkadziesiąt zajęć w miesiącu). W krytycznym momencie planowania dnia pytanie „czy ogarniemy to jednym autem?" pozostaje bez odpowiedzi aż do samego dnia — i wtedy okazuje się za późno.

Główna nierozwiązana luka: żadne popularne narzędzie (Google Calendar, Apple Calendar) nie modeluje zasobów fizycznych (auto) ani kontekstu rodzinnego (które dziecko, kto wiezie). Użytkownik musi sam pamiętać o kolizjach — a przy trójce dzieci i kilkudziesięciu wydarzeniach w miesiącu mentalny koszt tej koordinacji jest istotny i codziennie wracający.

## User & Persona

**Persona główna: Rodzic organizator (dorosły w household)**

- Rola: Jeden z dwojga rodziców, najczęściej ten który "ogarnia logistykę" w rodzinie
- Kontekst: Trójka dzieci, jedno auto wspólne, napięty tydzień — zajęcia sportowe, lekarze, wycieczki szkolne, urodziny
- Moment sięgnięcia po aplikację: Wieczór przed tygodniem / rano w dniu, gdy jest wiele wydarzeń — "co dzisiaj i czy daję radę jednym autem?"
- Apka jest prywatna dla household — nie multi-tenant SaaS

## Access Control

- Uwierzytelnienie: login per user — e-mail + hasło lub OAuth (Google)
- Model ról: płaski dla MVP — każdy zalogowany członek household ma pełne uprawnienia (tworzenie, edycja, usuwanie wydarzeń)
- Role separation (admin vs member) pozostaje jako Open Question — nie blokuje MVP

## Success Criteria

### Primary
- Rodzic loguje się, dodaje dwa wydarzenia tego samego dnia z flagą „auto potrzebne", aplikacja wykrywa i wyraźnie sygnalizuje konflikt zasobów — przepływ działa od początku do końca.

### Secondary
- Dashboard „Dziś" — po zalogowaniu strona główna pokazuje dzisiejsze wydarzenia, kto potrzebuje auta i czy są konflikty.

### Guardrails
- Dane household są widoczne wyłącznie dla zalogowanych członków — brak możliwości odczytu przez osoby spoza household.

## User Stories

### US-01: Rodzic wykrywa konflikt auta w dniu

- **Given** zalogowany rodzic z dwoma wydarzeniami tego samego dnia, oba z flagą „auto potrzebne"
- **When** przegląda widok dnia / dashboard Dziś
- **Then** widzi wyraźny alert o konflikcie zasobów z nazwami kolidujących wydarzeń i godzinami

#### Acceptance Criteria
- Alert pojawia się dla każdej pary wydarzeń nakładających się czasowo z flagą auta
- Alert zawiera tytuły obu wydarzeń, godziny i osoby
- Brak false positive: dwa wydarzenia bez flagi auta nie generują alertu

## Functional Requirements

### Uwierzytelnienie
- FR-001: Rodzic może zarejestrować się w aplikacji (e-mail + hasło lub OAuth Google). Priority: must-have
  > Socrates: Brak kontrargumantu — auth jest niezbędny od dnia 1 (prywatność danych household). Stoi.
- FR-002: Rodzic może zalogować się do aplikacji. Priority: must-have
  > Socrates: jw. Stoi.

### Zarządzanie wydarzeniami
- FR-003: Rodzic może dodać wydarzenie z polami: tytuł, osoba/dziecko, data, godzina, czas trwania, lokalizacja, notatki, flaga „auto potrzebne", kto jedzie. Priority: must-have
  > Socrates: Rozważono uproszczenie formularza (tylko tytuł/osoba/data/godzina/flaga). Odrzucono — lokalizacja i notatki są wartościowe od dnia 1 dla pełnoty kontekstu (np. adres lekarza). Pole „czas trwania" jest wymagane do precyzyjnej detekcji konfliktów. Stoi.
- FR-004: Rodzic może edytować istniejące wydarzenie. Priority: must-have
  > Socrates: Brak kontrargumantu — CRUD bez edycji zmuszałby do delete+re-add, co jest nieakceptowalne dla codziennego użytku. Stoi.
- FR-005: Rodzic może usunąć wydarzenie. Priority: must-have
  > Socrates: jw. Stoi.
- FR-006: Rodzic może przeglądać listę nadchodzących wydarzeń (widok listy chronologicznej). Priority: nice-to-have
  > Socrates: Kontragument zaakceptowany — Dashboard Dziś + widok konfliktu są wystarczające dla MVP. Osobna lista nadchodzących to drugorzędny ekran. Zdegradowany do nice-to-have.

### Detekcja konfliktów
- FR-007: Aplikacja wykrywa i wyraźnie sygnalizuje konflikt: dwa lub więcej wydarzeń w nakładającym się przedziale czasowym z flagą „auto potrzebne". Priority: must-have
  > Socrates: Brak kontrargumantu — detekcja konfliktu jest rdzeniem wartości produktu. Rozważono: brak pola "czas trwania" = potencjalne false positive (każde dwa wydarzenia w tym samym przedziale z flagą auta = konflikt, nawet jeśli nie zachodzą na siebie). Open Question: definicja "nakładającego się przedziału" — czy na podstawie godziny startu czy godziny startu + czas trwania? Stoi.

### Dashboard
- FR-008: Rodzic widzi dashboard „Dziś" ze: dzisiejszymi wydarzeniami, informacją kto potrzebuje auta, alertami o konfliktach i listą najbliższych wydarzeń. Priority: must-have
  > Socrates: Brak kontrargumantu — dashboard Dziś to główny entry point, agreguje najważniejsze informacje na jednym ekranie. Stoi.

### Nice-to-have (poza MVP)
- FR-009: Rodzic może tworzyć cykliczne (powtarzające się) wydarzenia (np. co tydzień). Priority: nice-to-have
- FR-010: Rodzic otrzymuje przypomnienia o wydarzeniach (e-mail 1h i 1 dzień przed). Priority: nice-to-have
- FR-011: Rodzic może przeglądać kalendarz w widoku tygodniowym lub miesięcznym. Priority: nice-to-have
- FR-012: Rodzic może przeglądać listę nadchodzących wydarzeń (widok listy chronologicznej). Priority: nice-to-have
- Aplikacja jest w pełni użyteczna na przeglądarce mobilnej — layout responsywny dostosowany do ekranów telefonów (minimalna szerokość 360 px).

## Business Logic

Aplikacja sygnalizuje konflikt zasobów, gdy co najmniej dwa wydarzenia tego samego dnia mają flagę „auto potrzebne" i nakładające się okno czasowe (godzina startu + czas trwania), umożliwiając rodzicom podjęcie decyzji logistycznej zanim konflikt wystąpi w rzeczywistości.

Definicja konfliktu: dwa wydarzenia kolidują, gdy spełnione są łącznie trzy warunki: (1) oba mają ustawioną flagę „auto potrzebne", (2) przedziały czasowe [godzina_startu, godzina_startu + czas_trwania] nakładają się, (3) obydwa są tego samego dnia.

Wejście reguły: zestaw wydarzeń z flagą auta w danym dniu, każde z godzina startu i czasem trwania podanymi przez użytkownika.
Wyjście reguły: lista par kolidujących wydarzeń z informacją o stopniu nakrywania się.
Punkt kontaktu z użytkownikiem: alert widoczny na dashboardzie Dziś oraz (w przyszłości) przy przeglądaniu widoku dnia.

## Non-Functional Requirements

- Usunięcie konta przez użytkownika skutkuje trwałym usunięciem wszystkich danych household (wydarzenia, profile, dane sesji) — brak danych rezydualnych po stronie serwera.
- Dane jednego household nie są dostępne dla zalogowanego użytkownika z innego household — izolacja danych jest wymagana od dnia 1.

## Non-Goals

- **Brak wielozasobowej logistyki** — MVP obsługuje wyłącznie jeden zasób „auto". Wiele aut, rowery, carpooling, transport zbiorowy pozostają poza zakresem — upraszcza regułę konfliktu do jednej osi.
- **Brak integracji z zewnętrznym kalendarzem** — brak synchronizacji z Google Calendar, Apple Calendar, iCal. Aplikacja jest odizolowanym narzędziem household w MVP.
- **Brak załączników i zdjęć** — pola tekstowe (notatki, lokalizacja) wystarczą do MVP; zarządzanie plikami to nieproporcjonalna złożoność.
- **Brak raportowania i statystyk** — brak widoku historii, analizy wzorców, eksportu danych do CSV/PDF w MVP.

## Open Questions

1. **Role separation within household** — czy oboje rodzice mają równe uprawnienia (flat model) czy potrzebny jest admin household? Właściciel: użytkownik. Blokuje: nie (MVP zakłada model płaski).
2. **Zarządzanie członkami household** — jak drugi rodzic dołącza do household (zaproszenie emailem, link, wspólne dane)? Właściciel: użytkownik. Blokuje: tak (wymaga decyzji przed implementacją auth).

## Quality cross-check

- Access Control: present
- Business Logic: present (jedna zdaniowa reguła)
- Project artifacts: present
- Timeline-cost ack: present (mvp_weeks: 3 — mieści się w progu)
- Non-Goals: present (4 pozycje)
- Preserved behavior: n/a (greenfield)

Status: **accepted** — brak luk.



