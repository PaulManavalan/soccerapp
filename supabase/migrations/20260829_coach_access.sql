-- Coach-scoped access and first-team onboarding.
-- Run after 20260823_initial_schema.sql.

alter table public.teams add column if not exists created_by uuid references auth.users(id) on delete set null;

create or replace function public.is_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_access_match(target_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.matches
    where id = target_match_id and public.is_team_member(team_id)
  );
$$;

create or replace function public.is_team_creator(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teams
    where id = target_team_id and created_by = auth.uid()
  );
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.teams, public.team_members, public.players, public.matches, public.duels to authenticated;
grant execute on function public.is_team_member(uuid), public.can_access_match(uuid), public.is_team_creator(uuid) to authenticated;

drop policy if exists "Coaches can view their teams" on public.teams;
create policy "Coaches can view their teams" on public.teams for select to authenticated using (
  public.is_team_member(id) or created_by = auth.uid()
);
drop policy if exists "Coaches can create teams" on public.teams;
create policy "Coaches can create teams" on public.teams for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "Owners can update teams" on public.teams;
create policy "Owners can update teams" on public.teams for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "Coaches can view team members" on public.team_members;
create policy "Coaches can view team members" on public.team_members for select to authenticated using (public.is_team_member(team_id));
drop policy if exists "Creators can join their new team" on public.team_members;
create policy "Creators can join their new team" on public.team_members for insert to authenticated with check (
  user_id = auth.uid() and public.is_team_creator(team_id)
);

drop policy if exists "Coaches can view players" on public.players;
create policy "Coaches can view players" on public.players for select to authenticated using (public.is_team_member(team_id));
drop policy if exists "Coaches can manage players" on public.players;
create policy "Coaches can manage players" on public.players for all to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

drop policy if exists "Coaches can view matches" on public.matches;
create policy "Coaches can view matches" on public.matches for select to authenticated using (public.is_team_member(team_id));
drop policy if exists "Coaches can manage matches" on public.matches;
create policy "Coaches can manage matches" on public.matches for all to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

drop policy if exists "Coaches can view duels" on public.duels;
create policy "Coaches can view duels" on public.duels for select to authenticated using (public.can_access_match(match_id));
drop policy if exists "Coaches can manage duels" on public.duels;
create policy "Coaches can manage duels" on public.duels for all to authenticated using (public.can_access_match(match_id)) with check (public.can_access_match(match_id));
