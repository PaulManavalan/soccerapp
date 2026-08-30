-- Coach display profiles. Run after 20260902_match_operations.sql.

create table if not exists public.coach_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  updated_at timestamptz not null default now()
);

alter table public.coach_profiles enable row level security;
grant select, insert, update on public.coach_profiles to authenticated;

drop policy if exists "Coaches can view own profile" on public.coach_profiles;
create policy "Coaches can view own profile" on public.coach_profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Coaches can manage own profile" on public.coach_profiles;
create policy "Coaches can manage own profile" on public.coach_profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Coaches can update own profile" on public.coach_profiles;
create policy "Coaches can update own profile" on public.coach_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
