-- Let coaches remove a private clip and its completed/queued queue record.
-- The app prevents removal while a local worker is actively analyzing it.

grant delete on public.duel_clip_jobs to authenticated;

drop policy if exists "Coaches can remove duel clip jobs" on public.duel_clip_jobs;
create policy "Coaches can remove duel clip jobs" on public.duel_clip_jobs
  for delete to authenticated using (public.can_access_team(team_id));
