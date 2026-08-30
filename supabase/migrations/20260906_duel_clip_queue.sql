-- Short-clip duel analysis intake. Run after 20260905_team_creator_access.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('duel-clips', 'duel-clips', false, 104857600, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.duel_clip_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  coach_note text,
  status text not null default 'queued' check (status in ('queued', 'analyzing', 'complete', 'failed')),
  suggested_player_id uuid references public.players(id) on delete set null,
  suggested_type public.duel_type,
  suggested_outcome public.duel_outcome,
  confidence smallint check (confidence between 0 and 100),
  worker_note text,
  duel_id uuid references public.duels(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists duel_clip_jobs_team_created_idx on public.duel_clip_jobs(team_id, created_at desc);
alter table public.duel_clip_jobs enable row level security;
grant select, insert on public.duel_clip_jobs to authenticated;

drop policy if exists "Coaches can view duel clip jobs" on public.duel_clip_jobs;
create policy "Coaches can view duel clip jobs" on public.duel_clip_jobs
  for select to authenticated using (public.can_access_team(team_id));
drop policy if exists "Coaches can queue duel clips" on public.duel_clip_jobs;
create policy "Coaches can queue duel clips" on public.duel_clip_jobs
  for insert to authenticated with check (
    uploaded_by = auth.uid() and public.can_access_team(team_id)
  );

drop policy if exists "Team coaches can read duel clips" on storage.objects;
create policy "Team coaches can read duel clips" on storage.objects
  for select to authenticated using (
    bucket_id = 'duel-clips'
    and public.can_access_team((storage.foldername(name))[1]::uuid)
  );
drop policy if exists "Team coaches can upload duel clips" on storage.objects;
create policy "Team coaches can upload duel clips" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'duel-clips'
    and public.can_access_team((storage.foldername(name))[1]::uuid)
  );
drop policy if exists "Team coaches can remove duel clips" on storage.objects;
create policy "Team coaches can remove duel clips" on storage.objects
  for delete to authenticated using (
    bucket_id = 'duel-clips'
    and public.can_access_team((storage.foldername(name))[1]::uuid)
  );
