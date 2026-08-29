-- Manual in-game event tracking. Run after 20260830_match_lineups.sql.

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  event_type text not null check (event_type in (
    'goal', 'shot_on_target', 'shot_off_target',
    'pass_complete', 'pass_incomplete',
    'tackle_won', 'tackle_lost', 'interception', 'clearance',
    'possession_won', 'possession_lost', 'foul_committed', 'foul_won',
    'yellow_card', 'red_card'
  )),
  occurred_at_seconds integer not null check (occurred_at_seconds >= 0),
  pitch_x numeric(5,2) check (pitch_x between 0 and 100),
  pitch_y numeric(5,2) check (pitch_y between 0 and 100),
  notes text check (char_length(notes) <= 240),
  created_at timestamptz not null default now()
);

create index if not exists match_events_match_id_idx on public.match_events(match_id);
create index if not exists match_events_player_id_idx on public.match_events(player_id);

alter table public.match_events enable row level security;
grant select, insert, update, delete on public.match_events to authenticated;

drop policy if exists "Coaches can view match events" on public.match_events;
create policy "Coaches can view match events" on public.match_events
  for select to authenticated using (public.can_access_match(match_id));

drop policy if exists "Coaches can manage match events" on public.match_events;
create policy "Coaches can manage match events" on public.match_events
  for all to authenticated using (public.can_access_match(match_id))
  with check (public.can_access_match(match_id));
