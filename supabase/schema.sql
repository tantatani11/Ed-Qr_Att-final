-- ============================================================
-- Phase 4 — Full rubric schema (Student / Teacher / Admin)
-- Run the ENTIRE file in Supabase SQL Editor. Idempotent.
-- Adds: admin role, event venue/description/status,
--       attendance status, admin RLS + helper.
-- ============================================================

-- 0. Admin helper (used by RLS policies below)
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ------------------------------------------------------------
-- 1. PROFILES TABLE
-- Stored per-user profile that references Supabase Auth.
-- Created automatically for each new signed-up user.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Upgrade existing DBs that still check only student/teacher:
do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles add constraint profiles_role_check
    check (role in ('student', 'teacher', 'admin'));
exception when others then null;
end $$;

alter table public.profiles enable row level security;

-- Academic info (filled in at Register for students).
alter table public.profiles add column if not exists year_level text;
alter table public.profiles add column if not exists program text;
alter table public.profiles add column if not exists block text;
do $$
begin
  alter table public.profiles drop constraint if exists profiles_block_check;
  alter table public.profiles add constraint profiles_block_check
    check (block is null or block in ('A', 'B', 'C', 'D', 'E', 'F'));
exception when others then null;
end $$;

-- Profiles policies
drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Automatically create a profile after a user signs up
-- Reads full_name/role from user_metadata so it works even when
-- email confirmation is ON (no session exists right after signUp).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, year_level, program, block)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null),
    coalesce(new.raw_user_meta_data ->> 'role', 'student'),
    coalesce(new.raw_user_meta_data ->> 'year_level', null),
    coalesce(new.raw_user_meta_data ->> 'program', null),
    coalesce(new.raw_user_meta_data ->> 'block', null)
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = case when excluded.role in ('student', 'teacher', 'admin') then excluded.role else public.profiles.role end,
    year_level = coalesce(excluded.year_level, public.profiles.year_level),
    program = coalesce(excluded.program, public.profiles.program),
    block = coalesce(excluded.block, public.profiles.block);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 2. EVENTS TABLE
-- Represents an attendance event (mirrors SQLite `events`).
-- `event_code` is the public identifier embedded in the QR code.
-- ------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  venue text,
  description text,
  status text not null default 'open' check (status in ('open', 'closed')),
  late_after_minutes integer not null default 15 check (late_after_minutes >= 0 and late_after_minutes <= 1440),
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
-- Upgrade columns on existing DBs:
alter table public.events add column if not exists venue text;
alter table public.events add column if not exists description text;
alter table public.events add column if not exists status text not null default 'open';
alter table public.events add column if not exists late_after_minutes integer not null default 15;
do $$
begin
  alter table public.events drop constraint if exists events_late_after_minutes_check;
  alter table public.events add constraint events_late_after_minutes_check
    check (late_after_minutes >= 0 and late_after_minutes <= 1440);
exception when others then null;
end $$;
do $$
begin
  alter table public.events drop constraint if exists events_status_check;
  alter table public.events add constraint events_status_check
    check (status in ('open', 'closed'));
exception when others then null;
end $$;

alter table public.events enable row level security;

-- Events policies
-- Any signed-in user can read event details (needed to validate QR codes)
drop policy if exists "Events are readable by any authenticated user" on public.events;
create policy "Events are readable by any authenticated user"
  on public.events for select
  using (auth.role() = 'authenticated');

-- Only teachers/admins can create events (students are blocked even via API).
-- Uses my_role() (SECURITY DEFINER) so students cannot spoof their role.
drop policy if exists "Users can insert events" on public.events;
drop policy if exists "Teachers and admins can insert events" on public.events;
create policy "Teachers and admins can insert events"
  on public.events for insert
  with check (
    auth.role() = 'authenticated'
    and (public.my_role() in ('teacher', 'admin'))
  );

drop policy if exists "Users can update their own events" on public.events;
create policy "Users can update their own events"
  on public.events for update
  using (auth.uid() = created_by or public.is_admin());

drop policy if exists "Admins can delete events" on public.events;
create policy "Admins can delete events"
  on public.events for delete
  using (auth.uid() = created_by or public.is_admin());

-- ------------------------------------------------------------
-- 3. ATTENDANCE TABLE
-- Records one student scanning one event.
-- `student_id` references the auth user, `event_id` references events.
-- Mirrors SQLite `attendance` table and its UNIQUE constraint.
-- ------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  status text not null default 'present' check (status in ('present', 'late', 'excused', 'absent')),
  scanned_at timestamptz not null default now(),
  unique (student_id, event_id)
);
alter table public.attendance add column if not exists status text not null default 'present';
do $$
begin
  alter table public.attendance drop constraint if exists attendance_status_check;
  alter table public.attendance add constraint attendance_status_check
    check (status in ('present', 'late', 'excused', 'absent'));
exception when others then null;
end $$;

alter table public.attendance enable row level security;

-- Attendance policies
-- Students can only view / insert their own attendance
drop policy if exists "Students can view their own attendance" on public.attendance;
create policy "Students can view their own attendance"
  on public.attendance for select
  using (auth.uid() = student_id);

drop policy if exists "Students can insert their own attendance" on public.attendance;
create policy "Students can insert their own attendance"
  on public.attendance for insert
  with check (auth.uid() = student_id);

-- Teachers can view attendance for events they created
drop policy if exists "Teachers can view attendance for their events" on public.attendance;
create policy "Teachers can view attendance for their events"
  on public.attendance for select
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
    or public.is_admin()
  );

-- Admins/staff can correct (update) and remove (delete) attendance records
drop policy if exists "Admins can update attendance" on public.attendance;
create policy "Admins can update attendance"
  on public.attendance for update
  using (public.is_admin());

drop policy if exists "Admins can delete attendance" on public.attendance;
create policy "Admins can delete attendance"
  on public.attendance for delete
  using (public.is_admin());

-- Admins can view every profile (user management)
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
  on public.profiles for update
  using (public.is_admin());

-- Teachers can read the profiles of students who attended their events
-- (needed to show attendee names in the teacher's History view).
-- Placed AFTER the attendance table exists.
drop policy if exists "Teachers can view profiles of their attendees" on public.profiles;
create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

------------------------------------------------------------
-- 4. TABLE GRANTS
-- REQUIRED: without these, PostgREST returns
--   "permission denied for table <name>" (code 42501)
-- and every table operation fails even though RLS policies exist.
-- Safe to re-run: GRANT is idempotent.
------------------------------------------------------------
grant select, insert, update, delete on public.profiles to anon, authenticated;
grant select, insert, update, delete on public.events to anon, authenticated;
grant select, insert, update, delete on public.attendance to anon, authenticated;

-- Helper RPC so the app can check admin without reading all profiles
create or replace function public.my_role()
returns text
language sql
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Realtime: live attendance monitoring (teacher History auto-refreshes on
-- every new scan). Safe to re-run. RLS still applies to realtime payloads.
do $$
begin
  alter publication supabase_realtime add table public.attendance;
exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.events;
exception when others then null;
end $$;

-- PROMOTE FIRST ADMIN (run once, replace email):
--   update public.profiles set role = 'admin'
--   where email = 'admin@school.edu';

------------------------------------------------------------
-- 5. HARDENING (Phase 5)
--    - Stop users from escalating their own role to admin.
--    - Harden the signup trigger so metadata can't grant admin.
--    - Enforce the schedule/closed rules for attendance on the SERVER
--      (cannot be bypassed by calling the API directly).
--    - Add indexes for the common lookups.
--    - Remove the unnecessary `anon` grants.
--    Safe to re-run.
------------------------------------------------------------

-- 5a. Signup trigger hardening: only student/teacher may be chosen via
--     user_metadata. Admin must be granted manually / by an admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, year_level, program, block)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null),
    case
      when new.raw_user_meta_data ->> 'role' in ('student', 'teacher')
        then new.raw_user_meta_data ->> 'role'
      else 'student'
    end,
    coalesce(new.raw_user_meta_data ->> 'year_level', null),
    coalesce(new.raw_user_meta_data ->> 'program', null),
    coalesce(new.raw_user_meta_data ->> 'block', null)
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    year_level = coalesce(excluded.year_level, public.profiles.year_level),
    program = coalesce(excluded.program, public.profiles.program),
    block = coalesce(excluded.block, public.profiles.block);
  return new;
end;
$$;

-- 5b. Column guard on profiles: a non-admin may never change their own
--     role to 'admin' (nor change email). Closes the privilege-escalation
--     hole where a user could run `update profiles set role='admin'`.
create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() is null for trusted server-side contexts (SQL editor /
  -- service role), which must stay able to grant the first admin.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and new.role = 'admin'
     and not public.is_admin() then
    raise exception 'NOT_ALLOWED_ROLE_CHANGE';
  end if;
  if new.email is distinct from old.email
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'NOT_ALLOWED_EMAIL_CHANGE';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_columns on public.profiles;
create trigger profiles_guard_columns
  before update on public.profiles
  for each row execute procedure public.guard_profile_columns();

-- 5c. Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

-- 5d. Server-side attendance validation. Runs as SECURITY DEFINER so it
--     can read the event row even though students can't select events
--     directly, and it computes the late status itself.
create or replace function public.validate_attendance()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  ev public.events;
begin
  select * into ev from public.events where id = new.event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if ev.status = 'closed' then
    raise exception 'EVENT_CLOSED';
  end if;
  if ev.start_time is not null and now() < ev.start_time then
    raise exception 'EVENT_NOT_STARTED';
  end if;
  if ev.end_time is not null and now() > ev.end_time then
    raise exception 'EVENT_ENDED';
  end if;
  -- Source of truth for late/present; ignore whatever the client sent.
  new.status := case
    when ev.start_time is not null
      and now() > ev.start_time + make_interval(mins => coalesce(ev.late_after_minutes, 15))
    then 'late'
    else 'present'
  end;
  return new;
end;
$$;

drop trigger if exists attendance_validate on public.attendance;
create trigger attendance_validate
  before insert on public.attendance
  for each row execute procedure public.validate_attendance();

-- 5e. Indexes for the common lookups.
create index if not exists attendance_student_id_idx on public.attendance (student_id);
create index if not exists attendance_event_id_idx on public.attendance (event_id);
create index if not exists attendance_scanned_at_idx on public.attendance (scanned_at desc);
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists events_status_idx on public.events (status);
create index if not exists profiles_role_idx on public.profiles (role);

-- 5f. The app always acts as an authenticated user (RLS needs auth.uid()),
--     so the anon role does not need any table access.
revoke all on public.profiles from anon;
revoke all on public.events from anon;
revoke all on public.attendance from anon;

-- 5g. Auto-close expired events.
--     Flips status to 'closed' once end_time has passed. Enforced in the
--     DB by a pg_cron job (runs every minute) and mirrored in the app by
--     effectiveStatus() so the UI updates immediately. Scans are already
--     blocked by the validate_attendance trigger regardless of status.
create or replace function public.close_expired_events()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  affected integer;
begin
  update public.events
  set status = 'closed'
  where status = 'open'
    and end_time is not null
    and end_time < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Schedule the job every minute. Enable pg_cron first in
-- Supabase → Database → Extensions. If it is unavailable, the DO blocks
-- below silently no-op and the app still treats expired events as closed.
do $$
begin
  create extension if not exists pg_cron;
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('close-expired-events');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule(
    'close-expired-events',
    '* * * * *',
    'select public.close_expired_events();'
  );
exception when others then null;
end $$;

------------------------------------------------------------
-- END OF SCHEMA
------------------------------------------------------------
