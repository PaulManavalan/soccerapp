-- Per-player, per-match stat lines generated from tracked events and duels.
-- Run after 20260831_match_events.sql.

create table if not exists public.player_match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  minutes_played integer not null default 0 check (minutes_played between 0 and 130),
  goals integer not null default 0 check (goals >= 0),
  shots integer not null default 0 check (shots >= 0),
  shots_on_target integer not null default 0 check (shots_on_target >= 0),
  passes_completed integer not null default 0 check (passes_completed >= 0),
  passes_attempted integer not null default 0 check (passes_attempted >= 0),
  tackles_won integer not null default 0 check (tackles_won >= 0),
  tackles_lost integer not null default 0 check (tackles_lost >= 0),
  interceptions integer not null default 0 check (interceptions >= 0),
  clearances integer not null default 0 check (clearances >= 0),
  duels_won integer not null default 0 check (duels_won >= 0),
  duels_lost integer not null default 0 check (duels_lost >= 0),
  possession_won integer not null default 0 check (possession_won >= 0),
  possession_lost integer not null default 0 check (possession_lost >= 0),
  fouls_committed integer not null default 0 check (fouls_committed >= 0),
  fouls_won integer not null default 0 check (fouls_won >= 0),
  yellow_cards integer not null default 0 check (yellow_cards >= 0),
  red_cards integer not null default 0 check (red_cards >= 0),
  rating numeric(3,1) check (rating between 1 and 10),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists player_match_stats_match_id_idx on public.player_match_stats(match_id);
create index if not exists player_match_stats_player_id_idx on public.player_match_stats(player_id);

alter table public.player_match_stats enable row level security;
grant select, insert, update, delete on public.player_match_stats to authenticated;

drop policy if exists "Coaches can view player match stats" on public.player_match_stats;
create policy "Coaches can view player match stats" on public.player_match_stats
  for select to authenticated using (public.can_access_match(match_id));

drop policy if exists "Coaches can manage player match stats" on public.player_match_stats;
create policy "Coaches can manage player match stats" on public.player_match_stats
  for all to authenticated using (public.can_access_match(match_id))
  with check (public.can_access_match(match_id));
