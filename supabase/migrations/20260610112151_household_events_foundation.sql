-- ============================================================================
-- F-01: Household + events schema + RLS isolation
-- ============================================================================
-- Foundation migration for the 10xFamily Schedule Hub.
--
-- This single migration sets up:
--   1. Four domain tables (households, household_members,
--      household_members_profiles, events) with indexes.
--   2. Row Level Security with granular per-operation, per-role policies
--      that isolate every household's data (PRD NFR + AGENTS.md mandate).
--   3. A SECURITY DEFINER trigger on auth.users that atomically creates a
--      household, a membership row, and a seed profile on every signup.
--   4. A self-cleaning DO $$ ... ASSERT $$ smoke test that fails this
--      migration if RLS leaks cross-household data.
--
-- See: context/changes/events-schema-and-rls/plan.md
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

comment on table public.households is
  'A family household. Owns events and member profiles. One row per registered user in MVP.';

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

comment on table public.household_members is
  'Links auth.users to households. MVP: one membership per user. Forward-compat with multi-member households.';

create index household_members_user_id_idx on public.household_members(user_id);

create table public.household_members_profiles (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  display_name  text not null check (length(trim(display_name)) > 0),
  kind          text not null check (kind in ('adult', 'child')) default 'adult',
  created_at    timestamptz not null default now()
);

comment on table public.household_members_profiles is
  'Display profiles of people in a household (adults, children). Referenced by events.subject_id / events.driver_id.';

create index household_members_profiles_household_id_idx
  on public.household_members_profiles(household_id);

create table public.events (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  subject_id       uuid not null references public.household_members_profiles(id) on delete restrict,
  driver_id        uuid references public.household_members_profiles(id) on delete restrict,
  title            text not null check (length(trim(title)) > 0),
  starts_at        timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  location         text,
  notes            text,
  car_needed       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint events_driver_only_when_car_needed
    check (car_needed = true or driver_id is null)
);

comment on table public.events is
  'A scheduled event inside a household. Conflict detection (S-02) uses tstzrange(starts_at, +duration) with the && operator.';

create index events_household_starts_at_idx
  on public.events(household_id, starts_at);

create index events_car_needed_partial_idx
  on public.events(household_id, starts_at)
  where car_needed;


-- ----------------------------------------------------------------------------
-- 2. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.households                  enable row level security;
alter table public.household_members           enable row level security;
alter table public.household_members_profiles  enable row level security;
alter table public.events                      enable row level security;

-- households: authenticated members can SELECT only their own household.
-- INSERT/UPDATE/DELETE intentionally omitted — household creation is performed
-- by the handle_new_user() trigger running as SECURITY DEFINER (bypasses RLS).
create policy households_select_own
  on public.households
  for select
  to authenticated
  using (
    id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

-- household_members: a user can read their OWN membership row(s). The
-- policy intentionally uses `user_id = auth.uid()` directly instead of the
-- subquery pattern used elsewhere — a subquery against household_members
-- inside a policy ON household_members triggers SQLSTATE 42P17
-- (infinite recursion in policy). For MVP this is also semantically right:
-- a single-user household exposes only the caller's membership row. When
-- multi-member households arrive (Parked in roadmap), replace this with a
-- SECURITY DEFINER helper like `public.auth_user_household_ids()` that
-- bypasses RLS once and returns the set of household_ids — then policies
-- on other tables can call it and this policy can broaden to cover
-- co-members. INSERT/UPDATE/DELETE intentionally omitted: membership
-- mutations belong to the future onboarding flow.
create policy household_members_select_own
  on public.household_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- household_members_profiles: full per-operation CRUD restricted to the
-- caller's household.
create policy household_members_profiles_select_own
  on public.household_members_profiles
  for select
  to authenticated
  using (
    household_id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

create policy household_members_profiles_insert_own
  on public.household_members_profiles
  for insert
  to authenticated
  with check (
    household_id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

create policy household_members_profiles_update_own
  on public.household_members_profiles
  for update
  to authenticated
  using (
    household_id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  )
  with check (
    household_id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

create policy household_members_profiles_delete_own
  on public.household_members_profiles
  for delete
  to authenticated
  using (
    household_id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

-- events: full per-operation CRUD restricted to the caller's household.
create policy events_select_own
  on public.events
  for select
  to authenticated
  using (
    household_id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

create policy events_insert_own
  on public.events
  for insert
  to authenticated
  with check (
    household_id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

create policy events_update_own
  on public.events
  for update
  to authenticated
  using (
    household_id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  )
  with check (
    household_id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

create policy events_delete_own
  on public.events
  for delete
  to authenticated
  using (
    household_id in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

-- Note: the `anon` role receives no policies on any of the four tables,
-- which means anonymous users have effectively zero access — RLS denies by
-- default when no policy matches.


-- ----------------------------------------------------------------------------
-- 3. handle_new_user trigger — atomic household + member + seed profile
-- ----------------------------------------------------------------------------
--
-- SECURITY DEFINER is required because this runs as a trigger on auth.users,
-- which authenticated cannot touch directly. SET search_path = public, pg_temp
-- closes the well-known Supabase footgun of privilege escalation via
-- search_path injection — do not remove either clause.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_household_id uuid;
begin
  insert into public.households default values
    returning id into new_household_id;

  insert into public.household_members (household_id, user_id)
    values (new_household_id, new.id);

  insert into public.household_members_profiles (household_id, display_name, kind)
    values (
      new_household_id,
      split_part(new.email, '@', 1),
      'adult'
    );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Trigger function: on every auth.users insert, atomically create a household, add the user as the first member, and seed one adult profile with display_name derived from the email local-part.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- 4. Smoke test — RLS cross-household isolation, self-cleaning
-- ----------------------------------------------------------------------------
--
-- Inserts two fake users (which fires the trigger and creates two isolated
-- households + members + profiles), then asserts that swapping JWT claims
-- between sessions yields the expected isolation.
--
-- Cleanup pattern: PL/pgSQL forbids EXECUTE of transaction commands
-- (SAVEPOINT, ROLLBACK), but `BEGIN ... EXCEPTION ... END` blocks are
-- implicit subtransactions. We wrap the test in such a block and raise a
-- sentinel exception (SQLSTATE '40004') at the end to roll back every
-- INSERT and SET LOCAL inside it. Any *other* exception — ASSERT failure
-- (P0004), RLS violation (42501), etc. — propagates and fails the migration,
-- which is exactly what we want for a foundation guarantee.

do $smoke$
declare
  user_a_id          uuid := gen_random_uuid();
  user_b_id          uuid := gen_random_uuid();
  household_a_id     uuid;
  subject_a_id       uuid;
  visible_count      integer;
  bob_write_blocked  boolean;
begin
  begin  -- inner subtransaction: everything inserted here is reverted by the sentinel raise
    -- Two fake users — minimal columns required by auth.users.
    -- encrypted_password is a free-form text field; placeholder is fine because
    -- these users never authenticate. This avoids depending on pgcrypto.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) values
      ('00000000-0000-0000-0000-000000000000', user_a_id, 'authenticated', 'authenticated',
       'smoke-alice@example.test', 'placeholder',
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false),
      ('00000000-0000-0000-0000-000000000000', user_b_id, 'authenticated', 'authenticated',
       'smoke-bob@example.test',   'placeholder',
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false);

    -- Find Alice's household and her seeded subject profile (the trigger
    -- created exactly one of each per insert).
    select household_id into household_a_id
      from public.household_members where user_id = user_a_id;

    select id into subject_a_id
      from public.household_members_profiles
      where household_id = household_a_id
      limit 1;

    -- ---- Switch to Alice's session ----
    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', user_a_id::text, 'role', 'authenticated')::text,
      true
    );

    -- Alice writes one event in her own household.
    insert into public.events (household_id, subject_id, title, starts_at, duration_minutes, car_needed)
    values (household_a_id, subject_a_id, 'smoke event A', now(), 30, false);

    -- Alice sees her event.
    select count(*) into visible_count from public.events;
    assert visible_count = 1,
      format('RLS smoke: expected Alice to see 1 event, saw %s', visible_count);

    -- Alice sees exactly her own household.
    select count(*) into visible_count from public.households;
    assert visible_count = 1,
      format('RLS smoke: expected Alice to see 1 household, saw %s', visible_count);

    -- Alice sees exactly her own profile.
    select count(*) into visible_count from public.household_members_profiles;
    assert visible_count = 1,
      format('RLS smoke: expected Alice to see 1 profile, saw %s', visible_count);

    -- ---- Switch to Bob's session ----
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', user_b_id::text, 'role', 'authenticated')::text,
      true
    );

    -- Bob must NOT see Alice's event.
    select count(*) into visible_count from public.events;
    assert visible_count = 0,
      format('RLS smoke: expected Bob to see 0 events, saw %s — CROSS-HOUSEHOLD LEAK', visible_count);

    -- Bob must see only his own household.
    select count(*) into visible_count from public.households;
    assert visible_count = 1,
      format('RLS smoke: expected Bob to see 1 household, saw %s', visible_count);

    -- Bob must see only his own profile.
    select count(*) into visible_count from public.household_members_profiles;
    assert visible_count = 1,
      format('RLS smoke: expected Bob to see 1 profile, saw %s', visible_count);

    -- Bob cannot INSERT an event into Alice's household — RLS WITH CHECK
    -- must reject it. We only swallow the expected denial codes; anything
    -- else propagates and fails the migration.
    bob_write_blocked := true;
    begin
      insert into public.events (household_id, subject_id, title, starts_at, duration_minutes, car_needed)
      values (household_a_id, subject_a_id, 'smoke leak attempt', now(), 30, false);
      bob_write_blocked := false;  -- only reached if the policy let it through
    exception
      when insufficient_privilege then null;  -- expected: RLS denial
      when check_violation         then null;  -- WITH CHECK rejection
    end;
    assert bob_write_blocked,
      'RLS smoke: Bob was allowed to INSERT into Alice''s household — CROSS-HOUSEHOLD LEAK';

    -- Restore default role + clear claims (defensive; subtransaction rollback
    -- handles this too, but explicit is safer if any future change moves the
    -- cleanup logic).
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);

    -- Sentinel: raise a uniquely-coded exception so the subtransaction rolls
    -- back. SQLSTATE '40004' belongs to the reserved transaction-integrity
    -- class and is unlikely to collide with anything the test itself raises.
    raise exception 'RLS_SMOKE_CLEANUP' using errcode = '40004';
  exception
    when sqlstate '40004' then
      null;  -- expected cleanup path — subtransaction rolled back
    -- All other exceptions (assert failures P0004, unexpected RLS errors,
    -- etc.) propagate out of the outer block and abort the migration.
  end;
end
$smoke$;
