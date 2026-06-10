---
change_id: events-schema-and-rls
title: Schemat households + events i polityki RLS izolujące dane per household
status: implementing
created: 2026-06-10
updated: 2026-06-10
archived_at: null
---

## Notes

Realizuje F-01 z [context/foundation/roadmap.md](../../foundation/roadmap.md). Zakres: minimalne tabele `households` i `events` (kolumny per FR-003: tytuł, osoba/dziecko, data, godzina, czas trwania, lokalizacja, notatki, flaga „auto potrzebne", kto jedzie), polityki RLS izolujące wszystkie operacje per `household_id`, oraz rozszerzenie istniejącej rejestracji Supabase Auth tak, aby tworzyła rekord `households` i wiązała usera jako pierwszego członka. Schemat celowo minimalny — kolejne slice'y (S-01..S-04) dopisują brakujące pola własnymi migracjami.

Open Unknown z roadmapy do rozstrzygnięcia w `/10x-plan`: czy household-id to dedykowana tabela `households` (UUID PK) z osobną tabelą `household_members`, czy `user_id` pierwszego rejestrującego się staje się de-facto household-id (model płaski single-member). Decyzja wpływa na kształt polityk RLS i na to, ile pracy zostanie do zrobienia, gdy odmrozimy onboarding drugiego rodzica (obecnie Parked).
