-- Matchday lineups. Run after 20260829_coach_access.sql.

create table if not exists public.match_lineups (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

alter table public.match_lineups enable row level security;
grant select, insert, delete on public.match_lineups to authenticated;

drop policy if exists "Coaches can view match lineups" on public.match_lineups;
create policy "Coaches can view match lineups" on public.match_lineups for select to authenticated using (public.can_access_match(match_id));
drop policy if exists "Coaches can manage match lineups" on public.match_lineups;
create policy "Coaches can manage match lineups" on public.match_lineups for all to authenticated using (public.can_access_match(match_id)) with check (public.can_access_match(match_id));
