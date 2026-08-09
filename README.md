# 10xFamily Schedule Hub

Aplikacja webowa do zarządzania harmonogramem rodziny z automatyczną detekcją konfliktów zasobu (samochód). Pozwala rodzicom planować wydarzenia dzieci i dorosłych, oznaczać które wymagają auta, i natychmiast widzieć, gdy dwa zdarzenia nakładają się czasowo — zanim konflikt wystąpi w rzeczywistości.

## Główne funkcje

- **Dashboard "Dziś"** — przegląd dzisiejszych wydarzeń, informacja kto potrzebuje auta, alerty o konfliktach
- **Zarządzanie wydarzeniami** — tworzenie, edytowanie i usuwanie wydarzeń z polami: tytuł, osoba/dziecko, data, godzina, czas trwania, lokalizacja, notatki, flaga „auto potrzebne", kto jedzie
- **Detekcja konfliktów** — automatyczne wykrywanie par wydarzeń z flagą „auto potrzebne", które nakładają się czasowo tego samego dnia
- **Izolacja danych** — każdy household widzi wyłącznie swoje dane; Row Level Security w Supabase egzekwuje izolację na poziomie bazy danych

## Tech Stack

- [Astro](https://astro.build/) v6 — SSR, routing oparty o pliki
- [React](https://react.dev/) v19 — interaktywne wyspy (formularze, przyciski)
- [TypeScript](https://www.typescriptlang.org/) v5 — pełne typowanie
- [Tailwind CSS](https://tailwindcss.com/) v4 — utility-first CSS
- [Supabase](https://supabase.com/) — autentykacja (e-mail + hasło) i baza danych PostgreSQL z RLS
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge deployment

## Wymagania

- Node.js v22.14.0 (patrz `.nvmrc`)
- npm (dołączony do Node.js)
- Docker (do lokalnego Supabase, ~7 GB RAM)

## Uruchomienie lokalne

1. Zainstaluj zależności:

```bash
npm install
```

2. Skopiuj plik zmiennych środowiskowych:

```bash
cp .env.example .dev.vars
```

3. Uruchom lokalny stack Supabase (pierwsze uruchomienie pobiera obrazy Docker):

```bash
npx supabase start
```

4. Skopiuj dane wydrukowane przez CLI do `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. Zastosuj migracje bazy danych:

```bash
npx supabase db push
```

6. Uruchom serwer deweloperski:

```bash
npm run dev
```

Aplikacja dostępna pod `http://localhost:4321`. Supabase Studio pod `http://localhost:54323`.

> **Email confirmation w lokalnym dev**: wejdź w Supabase Studio → Authentication → Email → wyłącz „Confirm email", żeby logować się bez klikania w link.

## Konfiguracja cloud Supabase (alternatywnie)

Jeśli zamiast lokalnego stacku wolisz projekt hostowany na [supabase.com](https://supabase.com):

| Zmienna | Opis |
|---|---|
| `SUPABASE_URL` | Project URL z Supabase dashboard → Settings → API |
| `SUPABASE_KEY` | Klucz `anon` z Supabase dashboard → Settings → API |

Ustaw te wartości w `.dev.vars` (lokalne Cloudflare dev) lub `.env` (Node.js).

## Dostępne skrypty

| Komenda | Opis |
|---|---|
| `npm run dev` | Serwer deweloperski (Cloudflare workerd runtime) |
| `npm run build` | Build produkcyjny |
| `npm run preview` | Podgląd buildu produkcyjnego |
| `npm run lint` | ESLint z regułami type-checked |
| `npm run lint:fix` | Auto-naprawa błędów ESLint |
| `npm run format` | Prettier |
| `npx vitest` | Testy jednostkowe i komponentowe |

## Struktura projektu

```
src/
├── pages/
│   ├── index.astro          # Strona główna (landing)
│   ├── dashboard.astro      # Dashboard "Dziś" z konfliktami
│   ├── events/              # Lista, nowe wydarzenie, edycja
│   └── api/
│       ├── auth/            # signin, signup, signout
│       └── events/          # CRUD endpointy
├── components/
│   ├── events/              # EventForm, DeleteEventButton
│   └── ui/                  # shadcn/ui komponenty
├── lib/
│   ├── services/
│   │   └── events.ts        # CRUD + detectCarConflicts()
│   └── supabase.ts          # Klient Supabase SSR
├── middleware.ts             # Autentykacja + ochrona tras
└── types.ts                 # Typy domenowe
supabase/
└── migrations/              # SQL migracje z RLS
context/
└── foundation/              # PRD, roadmap, test-plan i inne dokumenty fundacyjne
```

## Trasy aplikacji

| Trasa | Opis |
|---|---|
| `/auth/signin` | Logowanie (e-mail + hasło) |
| `/auth/signup` | Rejestracja |
| `/auth/confirm-email` | Strona po rejestracji |
| `/dashboard` | Dashboard "Dziś" — chroniony |
| `/events` | Lista wszystkich wydarzeń — chroniona |
| `/events/new` | Formularz nowego wydarzenia — chroniony |
| `/events/[id]/edit` | Edycja wydarzenia — chroniony |

## Deployment

Projekt deployuje się na Cloudflare Workers.

1. Zbuduj projekt:

```bash
npm run build
```

2. Wdróż przez Wrangler:

```bash
npx wrangler deploy
```

Ustaw `SUPABASE_URL` i `SUPABASE_KEY` jako sekrety w Cloudflare dashboard lub przez `npx wrangler secret put`.

## CI

GitHub Actions uruchamia lint + build przy każdym push i PR do `master`. Wymaga sekretów repozytorium `SUPABASE_URL` i `SUPABASE_KEY` dla kroku build.

## Licencja

MIT
