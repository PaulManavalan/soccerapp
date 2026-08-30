-- Lets the coach who created a team use it immediately, even if a team_members
-- row was not created during an interrupted first-time setup. Invited staff
-- continue to access teams through team_members.

create or replace function public.can_access_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_team_creator(target_team_id)
      or public.is_team_member(target_team_id);
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
    where id = target_match_id and public.can_access_team(team_id)
  );
$$;

grant execute on function public.can_access_team(uuid), public.can_access_match(uuid) to authenticated;

drop policy if exists "Coaches can view players" on public.players;
create policy "Coaches can view players" on public.players
  for select to authenticated using (public.can_access_team(team_id));
drop policy if exists "Coaches can manage players" on public.players;
create policy "Coaches can manage players" on public.players
  for all to authenticated using (public.can_access_team(team_id)) with check (public.can_access_team(team_id));

drop policy if exists "Coaches can view matches" on public.matches;
create policy "Coaches can view matches" on public.matches
  for select to authenticated using (public.can_access_team(team_id));
drop policy if exists "Coaches can manage matches" on public.matches;
create policy "Coaches can manage matches" on public.matches
  for all to authenticated using (public.can_access_team(team_id)) with check (public.can_access_team(team_id));
