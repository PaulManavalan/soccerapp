-- Match clock, player appearances, and substitutions.
-- Run after 20260901_player_match_stats.sql.

alter table public.matches add column if not exists clock_elapsed_seconds integer not null default 0 check (clock_elapsed_seconds between 0 and 7800);
alter table public.matches add column if not exists clock_running boolean not null default false;
alter table public.matches add column if not exists clock_started_at timestamptz;
alter table public.matches add column if not exists ended_at timestamptz;
alter table public.matches add column if not exists team_score smallint not null default 0 check (team_score between 0 and 99);
alter table public.matches add column if not exists opponent_score smallint not null default 0 check (opponent_score between 0 and 99);

create table if not exists public.match_player_appearances (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  is_starter boolean not null default false,
  entered_at_seconds integer check (entered_at_seconds between 0 and 7800),
  exited_at_seconds integer check (exited_at_seconds between 0 and 7800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id),
  check (exited_at_seconds is null or entered_at_seconds is not null and exited_at_seconds >= entered_at_seconds)
);

create index if not exists match_player_appearances_match_id_idx on public.match_player_appearances(match_id);

alter table public.match_player_appearances enable row level security;
grant select, insert, update, delete on public.match_player_appearances to authenticated;

drop policy if exists "Coaches can view match appearances" on public.match_player_appearances;
create policy "Coaches can view match appearances" on public.match_player_appearances
  for select to authenticated using (public.can_access_match(match_id));

drop policy if exists "Coaches can manage match appearances" on public.match_player_appearances;
create policy "Coaches can manage match appearances" on public.match_player_appearances
  for all to authenticated using (public.can_access_match(match_id))
  with check (public.can_access_match(match_id));
