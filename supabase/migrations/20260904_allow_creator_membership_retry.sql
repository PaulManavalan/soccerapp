-- Allows a team creator to safely retry creating their own coach membership.
-- This does not allow a coach to change another member or promote themselves.

drop policy if exists "Creators can retry own coach membership" on public.team_members;
create policy "Creators can retry own coach membership" on public.team_members
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.is_team_creator(team_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_team_creator(team_id)
    and role = 'coach'
  );
